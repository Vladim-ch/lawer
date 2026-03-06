"use client";

import { useEffect } from "react";
import { useAuthStore } from "@/stores/authStore";
import { useChatStore } from "@/stores/chatStore";

export function Sidebar() {
  const { user, token, logout } = useAuthStore();
  const {
    conversations,
    activeConversationId,
    isLoadingConversations,
    loadConversations,
    selectConversation,
    createConversation,
    deleteConversation,
  } = useChatStore();

  useEffect(() => {
    if (token) {
      loadConversations(token);
    }
  }, [token, loadConversations]);

  const handleNewChat = async () => {
    if (token) {
      await createConversation(token);
    }
  };

  const handleSelect = async (id: string) => {
    if (token) {
      await selectConversation(id, token);
    }
  };

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (token && confirm("Удалить этот диалог?")) {
      await deleteConversation(id, token);
    }
  };

  return (
    <aside className="w-72 bg-gray-900 text-white flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b border-gray-700">
        <h1 className="text-lg font-bold">Lawer</h1>
        <p className="text-xs text-gray-400 mt-0.5">AI-ассистент юридического отдела</p>
      </div>

      {/* New chat button */}
      <div className="p-3">
        <button
          onClick={handleNewChat}
          className="w-full flex items-center gap-2 px-3 py-2.5 border border-gray-600 rounded-lg
                     hover:bg-gray-800 transition-colors text-sm"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Новый диалог
        </button>
      </div>

      {/* Conversations list */}
      <div className="flex-1 overflow-y-auto px-2">
        {isLoadingConversations ? (
          <div className="text-center text-gray-500 text-sm py-4">Загрузка...</div>
        ) : conversations.length === 0 ? (
          <div className="text-center text-gray-500 text-sm py-4">
            Нет диалогов. Начните новый!
          </div>
        ) : (
          <div className="space-y-1">
            {conversations.map((conv) => (
              <div
                key={conv.id}
                onClick={() => handleSelect(conv.id)}
                className={`group flex items-center gap-2 px-3 py-2.5 rounded-lg cursor-pointer text-sm
                  ${
                    activeConversationId === conv.id
                      ? "bg-gray-700 text-white"
                      : "text-gray-300 hover:bg-gray-800"
                  }`}
              >
                <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"
                  />
                </svg>
                <span className="flex-1 truncate">{conv.title}</span>
                <button
                  onClick={(e) => handleDelete(e, conv.id)}
                  className="opacity-0 group-hover:opacity-100 p-1 hover:text-red-400 transition-opacity"
                  title="Удалить"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                    />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* User info */}
      <div className="p-3 border-t border-gray-700">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-8 h-8 rounded-full bg-primary-600 flex items-center justify-center text-sm font-medium shrink-0">
              {user?.name?.charAt(0)?.toUpperCase() || "U"}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium truncate">{user?.name}</p>
              <p className="text-xs text-gray-400 truncate">{user?.email}</p>
            </div>
          </div>
          <button
            onClick={logout}
            className="p-1.5 text-gray-400 hover:text-white transition-colors"
            title="Выйти"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
              />
            </svg>
          </button>
        </div>
      </div>
    </aside>
  );
}
