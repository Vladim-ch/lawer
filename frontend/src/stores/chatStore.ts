import { create } from "zustand";
import { apiFetch, createSSEStream, SSECallbacks } from "@/lib/api";

interface Message {
  id: string;
  conversationId: string;
  role: "user" | "assistant" | "system";
  content: string;
  createdAt: string;
}

interface ToolStatus {
  tool: string;
  status: "calling" | "done" | "error";
}

interface Conversation {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messages?: { content: string; role: string; createdAt: string }[];
}

interface ChatState {
  conversations: Conversation[];
  activeConversationId: string | null;
  messages: Message[];
  isLoadingConversations: boolean;
  isStreaming: boolean;
  streamingContent: string;
  toolStatus: ToolStatus | null;
  abortController: AbortController | null;

  loadConversations: (token: string) => Promise<void>;
  selectConversation: (id: string, token: string) => Promise<void>;
  createConversation: (token: string) => Promise<string>;
  deleteConversation: (id: string, token: string) => Promise<void>;
  sendMessage: (content: string, token: string) => Promise<void>;
  stopStreaming: () => void;
}

export const useChatStore = create<ChatState>()((set, get) => ({
  conversations: [],
  activeConversationId: null,
  messages: [],
  isLoadingConversations: false,
  isStreaming: false,
  streamingContent: "",
  toolStatus: null,
  abortController: null,

  loadConversations: async (token) => {
    set({ isLoadingConversations: true });
    try {
      const data = await apiFetch<Conversation[]>("/api/conversations", { token });
      set({ conversations: data, isLoadingConversations: false });
    } catch {
      set({ isLoadingConversations: false });
    }
  },

  selectConversation: async (id, token) => {
    set({ activeConversationId: id, messages: [] });
    try {
      const data = await apiFetch<{ messages: Message[] }>(`/api/conversations/${id}`, { token });
      set({ messages: data.messages || [] });
    } catch {
      // noop
    }
  },

  createConversation: async (token) => {
    const data = await apiFetch<Conversation>("/api/conversations", {
      method: "POST",
      body: {},
      token,
    });
    set((state) => ({
      conversations: [data, ...state.conversations],
      activeConversationId: data.id,
      messages: [],
    }));
    return data.id;
  },

  deleteConversation: async (id, token) => {
    await apiFetch(`/api/conversations/${id}`, { method: "DELETE", token });
    set((state) => ({
      conversations: state.conversations.filter((c) => c.id !== id),
      activeConversationId: state.activeConversationId === id ? null : state.activeConversationId,
      messages: state.activeConversationId === id ? [] : state.messages,
    }));
  },

  sendMessage: async (content, token) => {
    const state = get();
    let convId = state.activeConversationId;

    if (!convId) {
      convId = await get().createConversation(token);
    }

    // Add user message optimistically
    const userMsg: Message = {
      id: `temp-${Date.now()}`,
      conversationId: convId,
      role: "user",
      content,
      createdAt: new Date().toISOString(),
    };

    set((s) => ({
      messages: [...s.messages, userMsg],
      isStreaming: true,
      streamingContent: "",
    }));

    const callbacks: SSECallbacks = {
      onToken: (tokenContent) => {
        set((s) => ({ streamingContent: s.streamingContent + tokenContent }));
      },
      onDone: (messageId) => {
        const finalContent = get().streamingContent;
        const assistantMsg: Message = {
          id: messageId,
          conversationId: convId!,
          role: "assistant",
          content: finalContent,
          createdAt: new Date().toISOString(),
        };
        set((s) => ({
          messages: [...s.messages, assistantMsg],
          isStreaming: false,
          streamingContent: "",
          toolStatus: null,
          abortController: null,
        }));
        // Reload conversations to get updated title
        get().loadConversations(token);
      },
      onError: (error) => {
        console.error("SSE error:", error);
        set({ isStreaming: false, streamingContent: "", toolStatus: null, abortController: null });
      },
      onToolCall: (tool) => {
        set({ toolStatus: { tool, status: "calling" } });
      },
      onToolResult: (tool, success) => {
        set({ toolStatus: { tool, status: success ? "done" : "error" } });
        // Clear tool status after a short delay
        setTimeout(() => set({ toolStatus: null }), 1500);
      },
    };

    const controller = createSSEStream(
      `/api/conversations/${convId}/messages`,
      { content },
      token,
      callbacks,
    );

    set({ abortController: controller });
  },

  stopStreaming: () => {
    const { abortController, streamingContent } = get();
    if (abortController) {
      abortController.abort();
    }
    if (streamingContent) {
      const assistantMsg: Message = {
        id: `stopped-${Date.now()}`,
        conversationId: get().activeConversationId || "",
        role: "assistant",
        content: streamingContent,
        createdAt: new Date().toISOString(),
      };
      set((s) => ({
        messages: [...s.messages, assistantMsg],
        isStreaming: false,
        streamingContent: "",
        toolStatus: null,
        abortController: null,
      }));
    } else {
      set({ isStreaming: false, streamingContent: "", toolStatus: null, abortController: null });
    }
  },
}));
