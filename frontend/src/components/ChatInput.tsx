"use client";

import { useState, useRef, useCallback, KeyboardEvent } from "react";
import { apiUpload } from "@/lib/api";

interface UploadedDoc {
  id: string;
  filename: string;
}

interface ChatInputProps {
  onSend: (content: string, attachments?: { documentId: string; filename: string }[]) => void;
  disabled?: boolean;
  token: string;
}

const ACCEPTED_TYPES = ".pdf,.docx,.txt";

export function ChatInput({ onSend, disabled, token }: ChatInputProps) {
  const [value, setValue] = useState("");
  const [attachedFile, setAttachedFile] = useState<File | null>(null);
  const [uploadedDoc, setUploadedDoc] = useState<UploadedDoc | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const clearFile = useCallback(() => {
    setAttachedFile(null);
    setUploadedDoc(null);
    setUploadError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }, []);

  const handleFileSelect = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      setAttachedFile(file);
      setUploadedDoc(null);
      setUploadError(null);
      setIsUploading(true);

      try {
        const doc = await apiUpload<{ id: string; filename: string; fileType: string; fileSize: number; contentText: string | null }>(
          "/api/documents/upload",
          file,
          token,
        );
        setUploadedDoc({ id: doc.id, filename: doc.filename });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Ошибка загрузки";
        setUploadError(message);
        setAttachedFile(null);
      } finally {
        setIsUploading(false);
      }
    },
    [token],
  );

  const handleSend = () => {
    const trimmed = value.trim();
    if ((!trimmed && !uploadedDoc) || disabled) return;

    const attachments = uploadedDoc
      ? [{ documentId: uploadedDoc.id, filename: uploadedDoc.filename }]
      : undefined;

    onSend(trimmed, attachments);
    setValue("");
    clearFile();

    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleInput = () => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = "auto";
      textarea.style.height = Math.min(textarea.scrollHeight, 200) + "px";
    }
  };

  return (
    <div className="flex flex-col gap-1.5">
      {/* File preview chip */}
      {(attachedFile || uploadError) && (
        <div className="flex items-center gap-2 px-2">
          <div
            className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm ${
              uploadError
                ? "bg-red-50 border border-red-200 text-red-700"
                : "bg-gray-100 border border-gray-200 text-gray-700"
            }`}
          >
            {isUploading ? (
              <svg className="w-4 h-4 animate-spin text-primary-600" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            ) : uploadError ? (
              <svg className="w-4 h-4 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            ) : (
              <svg className="w-4 h-4 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
              </svg>
            )}
            <span className="truncate max-w-[200px]">
              {uploadError || attachedFile?.name}
            </span>
            <button
              onClick={clearFile}
              className="p-0.5 hover:bg-gray-200 rounded transition-colors"
              title="Удалить файл"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* Input row */}
      <div className="flex items-end gap-2 bg-gray-50 border border-gray-200 rounded-xl p-2">
        {/* Paperclip button */}
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled || isUploading}
          className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100
                     disabled:opacity-50 disabled:cursor-not-allowed transition-colors shrink-0"
          title="Прикрепить файл"
        >
          {isUploading ? (
            <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          ) : (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.414 6.586a6 6 0 108.486 8.486L20.5 13"
              />
            </svg>
          )}
        </button>

        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPTED_TYPES}
          onChange={handleFileSelect}
          className="hidden"
        />

        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            handleInput();
          }}
          onKeyDown={handleKeyDown}
          placeholder="Введите сообщение... (Enter -- отправить, Shift+Enter -- новая строка)"
          disabled={disabled}
          rows={1}
          className="flex-1 resize-none bg-transparent border-none outline-none text-sm px-2 py-1.5
                     placeholder-gray-400 max-h-[200px] disabled:opacity-50"
        />

        <button
          onClick={handleSend}
          disabled={disabled || (!value.trim() && !uploadedDoc)}
          className="p-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700
                     disabled:opacity-50 disabled:cursor-not-allowed transition-colors shrink-0"
          title="Отправить"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
            />
          </svg>
        </button>
      </div>
    </div>
  );
}
