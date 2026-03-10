"use client";

import { useState, FormEvent, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/stores/authStore";

export default function ChangePasswordPage() {
  const router = useRouter();
  const { token, isLoading, error, changePassword, clearError } = useAuthStore();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [localError, setLocalError] = useState("");
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!token) {
      router.replace("/login");
    }
  }, [token, router]);

  useEffect(() => {
    clearError();
  }, [clearError]);

  useEffect(() => {
    if (success) {
      router.replace("/chat");
    }
  }, [success, router]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLocalError("");

    if (newPassword.length < 6) {
      setLocalError("Пароль должен содержать минимум 6 символов");
      return;
    }

    if (newPassword !== confirmPassword) {
      setLocalError("Пароли не совпадают");
      return;
    }

    await changePassword(currentPassword, newPassword);

    const storeError = useAuthStore.getState().error;
    if (!storeError) {
      setSuccess(true);
    }
  };

  if (!token) return null;

  const displayError = localError || error;

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="max-w-md w-full">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Lawer</h1>
          <p className="mt-2 text-gray-600">AI-ассистент юридического отдела</p>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8">
          <h2 className="text-xl font-semibold mb-2">Смена пароля</h2>
          <p className="text-sm text-gray-600 mb-6">
            Необходимо сменить пароль при первом входе
          </p>

          {displayError && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
              {displayError}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="currentPassword" className="block text-sm font-medium text-gray-700 mb-1">
                Текущий пароль
              </label>
              <input
                id="currentPassword"
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="input-field"
                placeholder="Введите текущий пароль"
                required
              />
            </div>

            <div>
              <label htmlFor="newPassword" className="block text-sm font-medium text-gray-700 mb-1">
                Новый пароль
              </label>
              <input
                id="newPassword"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="input-field"
                placeholder="Минимум 6 символов"
                required
              />
            </div>

            <div>
              <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 mb-1">
                Подтвердите новый пароль
              </label>
              <input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="input-field"
                placeholder="Повторите новый пароль"
                required
              />
            </div>

            <button type="submit" disabled={isLoading} className="btn-primary w-full">
              {isLoading ? "Сохранение..." : "Сменить пароль"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
