"use client";

import { useRef, useEffect } from "react";
import { useAuthStore } from "@/stores/authStore";
import { useChatStore } from "@/stores/chatStore";
import { MessageBubble } from "./MessageBubble";
import { ChatInput } from "./ChatInput";

export function ChatArea() {
  const token = useAuthStore((s) => s.token);
  const {
    messages,
    activeConversationId,
    isStreaming,
    streamingContent,
    toolStatus,
    sendMessage,
    stopStreaming,
  } = useChatStore();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingContent]);

  const handleSend = async (content: string, attachments?: { documentId: string; filename: string }[]) => {
    if (token) {
      await sendMessage(content, token, attachments);
    }
  };

  // Empty state
  if (!activeConversationId && messages.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8">
        <div className="max-w-lg text-center">
          <div className="w-16 h-16 bg-primary-100 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <svg className="w-8 h-8 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l-3 9a5.002 5.002 0 006.001 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3"
              />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-3">Добро пожаловать в Lawer</h2>
          <p className="text-gray-600 mb-6">
            AI-ассистент юридического отдела. Я помогу вам с анализом документов, генерацией
            договоров и юридическими вопросами.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-left">
            <SuggestionCard
              title="Анализ документа"
              description="Загрузите документ для получения резюме и выявления рисков"
              onClick={() => handleSend("Мне нужно проанализировать документ")}
            />
            <SuggestionCard
              title="Договор поставки"
              description="Создать типовой договор поставки товаров"
              onClick={() => handleSend("Помоги составить договор поставки")}
            />
            <SuggestionCard
              title="Юридический вопрос"
              description="Задайте вопрос по законодательству РФ"
              onClick={() => handleSend("У меня есть юридический вопрос")}
            />
          </div>
        </div>

        <div className="w-full max-w-2xl mt-8">
          <ChatInput onSend={handleSend} disabled={isStreaming} token={token!} />
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-6">
        <div className="max-w-3xl mx-auto space-y-4">
          {messages.map((msg) => (
            <MessageBubble key={msg.id} role={msg.role} content={msg.content} attachments={msg.attachments} />
          ))}

          {/* Streaming message */}
          {isStreaming && streamingContent && (
            <MessageBubble role="assistant" content={streamingContent} isStreaming />
          )}

          {/* Tool use indicator */}
          {isStreaming && toolStatus && (
            <div className="flex items-center gap-2 px-4 py-2 ml-11 text-sm text-gray-500">
              {toolStatus.status === "calling" && (
                <>
                  <svg className="w-4 h-4 animate-spin text-primary-500" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  <span>Использую инструмент: <span className="font-medium text-gray-700">{toolStatus.tool}</span></span>
                </>
              )}
              {toolStatus.status === "done" && (
                <>
                  <svg className="w-4 h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <span>Инструмент <span className="font-medium text-gray-700">{toolStatus.tool}</span> выполнен</span>
                </>
              )}
              {toolStatus.status === "error" && (
                <>
                  <svg className="w-4 h-4 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                  <span>Ошибка инструмента <span className="font-medium text-gray-700">{toolStatus.tool}</span></span>
                </>
              )}
            </div>
          )}

          {/* Streaming indicator without content yet */}
          {isStreaming && !streamingContent && !toolStatus && (
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-primary-100 flex items-center justify-center shrink-0">
                <svg className="w-4 h-4 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l-3 9a5.002 5.002 0 006.001 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3" />
                </svg>
              </div>
              <div className="flex items-center gap-1 pt-2">
                <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input area */}
      <div className="border-t bg-white px-4 py-3">
        <div className="max-w-3xl mx-auto">
          {isStreaming && (
            <div className="flex justify-center mb-2">
              <button
                onClick={stopStreaming}
                className="px-3 py-1.5 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg
                           transition-colors flex items-center gap-1.5 text-gray-600"
              >
                <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                  <rect x="6" y="6" width="12" height="12" rx="1" />
                </svg>
                Остановить генерацию
              </button>
            </div>
          )}
          <ChatInput onSend={handleSend} disabled={isStreaming} token={token!} />
        </div>
      </div>
    </div>
  );
}

function SuggestionCard({
  title,
  description,
  onClick,
}: {
  title: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="p-4 bg-white border border-gray-200 rounded-xl text-left hover:border-primary-300
                 hover:shadow-sm transition-all"
    >
      <h3 className="font-medium text-gray-900 text-sm mb-1">{title}</h3>
      <p className="text-xs text-gray-500">{description}</p>
    </button>
  );
}
