"use client";

import { useState, useEffect, FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/stores/authStore";
import { apiFetch } from "@/lib/api";

interface AdminUser {
  id: string;
  email: string;
  name: string;
  role: string;
  createdAt: string;
  mustChangePassword: boolean;
}

type ModalMode = "create" | "edit" | null;

export default function AdminUsersPage() {
  const router = useRouter();
  const { token, user } = useAuthStore();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Modal state
  const [modalMode, setModalMode] = useState<ModalMode>(null);
  const [editingUser, setEditingUser] = useState<AdminUser | null>(null);
  const [formName, setFormName] = useState("");
  const [formEmail, setFormEmail] = useState("");
  const [formPassword, setFormPassword] = useState("");
  const [formRole, setFormRole] = useState("lawyer");
  const [formLoading, setFormLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Delete confirmation
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      router.replace("/login");
      return;
    }
    if (user?.role !== "admin") {
      router.replace("/chat");
      return;
    }
    fetchUsers();
  }, [token, user, router]);

  const fetchUsers = async () => {
    if (!token) return;
    setIsLoading(true);
    setError(null);
    try {
      const data = await apiFetch<AdminUser[]>("/api/admin/users", { token });
      setUsers(data);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsLoading(false);
    }
  };

  const openCreateModal = () => {
    setModalMode("create");
    setEditingUser(null);
    setFormName("");
    setFormEmail("");
    setFormPassword("");
    setFormRole("lawyer");
    setFormError(null);
  };

  const openEditModal = (u: AdminUser) => {
    setModalMode("edit");
    setEditingUser(u);
    setFormName(u.name);
    setFormEmail(u.email);
    setFormPassword("");
    setFormRole(u.role);
    setFormError(null);
  };

  const closeModal = () => {
    setModalMode(null);
    setEditingUser(null);
    setFormError(null);
  };

  const handleCreateSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!token) return;
    setFormLoading(true);
    setFormError(null);
    try {
      await apiFetch("/api/admin/users", {
        method: "POST",
        body: { name: formName, email: formEmail, password: formPassword, role: formRole },
        token,
      });
      closeModal();
      await fetchUsers();
    } catch (err) {
      setFormError((err as Error).message);
    } finally {
      setFormLoading(false);
    }
  };

  const handleEditSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!token || !editingUser) return;
    setFormLoading(true);
    setFormError(null);
    try {
      await apiFetch(`/api/admin/users/${editingUser.id}`, {
        method: "PATCH",
        body: { name: formName, email: formEmail, role: formRole },
        token,
      });
      closeModal();
      await fetchUsers();
    } catch (err) {
      setFormError((err as Error).message);
    } finally {
      setFormLoading(false);
    }
  };

  const handleResetPassword = async (userId: string) => {
    if (!token) return;
    try {
      await apiFetch(`/api/admin/users/${userId}`, {
        method: "PATCH",
        body: { resetPassword: true },
        token,
      });
      await fetchUsers();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleDelete = async (userId: string) => {
    if (!token) return;
    try {
      await apiFetch(`/api/admin/users/${userId}`, {
        method: "DELETE",
        token,
      });
      setDeletingId(null);
      await fetchUsers();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  if (!token || user?.role !== "admin") return null;

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString("ru-RU", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  };

  const roleLabels: Record<string, string> = {
    admin: "Администратор",
    lawyer: "Юрист",
    viewer: "Наблюдатель",
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Управление пользователями</h1>
            <p className="text-sm text-gray-500 mt-0.5">Администрирование системы Lawer</p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push("/chat")}
              className="text-sm text-gray-600 hover:text-gray-900 transition-colors"
            >
              Вернуться к чату
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-4 py-6">
        {/* Error */}
        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
            {error}
            <button onClick={() => setError(null)} className="ml-2 font-medium hover:underline">
              Закрыть
            </button>
          </div>
        )}

        {/* Actions */}
        <div className="mb-4 flex justify-between items-center">
          <span className="text-sm text-gray-500">
            Всего пользователей: {users.length}
          </span>
          <button onClick={openCreateModal} className="btn-primary flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Создать пользователя
          </button>
        </div>

        {/* Table */}
        {isLoading ? (
          <div className="text-center text-gray-500 py-12">Загрузка...</div>
        ) : (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="text-left px-4 py-3 font-medium text-gray-700">Имя</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-700">Email</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-700">Роль</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-700">Дата создания</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-700">Действия</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-full bg-primary-600 flex items-center justify-center text-white text-xs font-medium shrink-0">
                            {u.name?.charAt(0)?.toUpperCase() || "U"}
                          </div>
                          <span className="font-medium text-gray-900">{u.name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-gray-600">{u.email}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
                            u.role === "admin"
                              ? "bg-purple-100 text-purple-700"
                              : u.role === "lawyer"
                                ? "bg-blue-100 text-blue-700"
                                : "bg-gray-100 text-gray-700"
                          }`}
                        >
                          {roleLabels[u.role] || u.role}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-500">{formatDate(u.createdAt)}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => openEditModal(u)}
                            className="p-1.5 text-gray-400 hover:text-blue-600 transition-colors"
                            title="Редактировать"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                              />
                            </svg>
                          </button>
                          <button
                            onClick={() => handleResetPassword(u.id)}
                            className="p-1.5 text-gray-400 hover:text-orange-600 transition-colors"
                            title="Сбросить пароль"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"
                              />
                            </svg>
                          </button>
                          {deletingId === u.id ? (
                            <div className="flex items-center gap-1 ml-1">
                              <button
                                onClick={() => handleDelete(u.id)}
                                className="px-2 py-1 text-xs bg-red-600 text-white rounded hover:bg-red-700 transition-colors"
                              >
                                Да
                              </button>
                              <button
                                onClick={() => setDeletingId(null)}
                                className="px-2 py-1 text-xs bg-gray-200 text-gray-700 rounded hover:bg-gray-300 transition-colors"
                              >
                                Нет
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => setDeletingId(u.id)}
                              className="p-1.5 text-gray-400 hover:text-red-600 transition-colors"
                              title="Удалить"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                                />
                              </svg>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {users.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-gray-500">
                        Нет пользователей
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Modal */}
      {modalMode && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
            <h3 className="text-lg font-semibold mb-4">
              {modalMode === "create" ? "Создать пользователя" : "Редактировать пользователя"}
            </h3>

            {formError && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
                {formError}
              </div>
            )}

            <form onSubmit={modalMode === "create" ? handleCreateSubmit : handleEditSubmit} className="space-y-4">
              <div>
                <label htmlFor="modalName" className="block text-sm font-medium text-gray-700 mb-1">
                  Имя
                </label>
                <input
                  id="modalName"
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  className="input-field"
                  placeholder="Иванов Иван Иванович"
                  required
                />
              </div>

              <div>
                <label htmlFor="modalEmail" className="block text-sm font-medium text-gray-700 mb-1">
                  Email
                </label>
                <input
                  id="modalEmail"
                  type="email"
                  value={formEmail}
                  onChange={(e) => setFormEmail(e.target.value)}
                  className="input-field"
                  placeholder="user@company.ru"
                  required
                />
              </div>

              {modalMode === "create" && (
                <div>
                  <label htmlFor="modalPassword" className="block text-sm font-medium text-gray-700 mb-1">
                    Пароль
                  </label>
                  <input
                    id="modalPassword"
                    type="password"
                    value={formPassword}
                    onChange={(e) => setFormPassword(e.target.value)}
                    className="input-field"
                    placeholder="Минимум 6 символов"
                    required
                  />
                </div>
              )}

              <div>
                <label htmlFor="modalRole" className="block text-sm font-medium text-gray-700 mb-1">
                  Роль
                </label>
                <select
                  id="modalRole"
                  value={formRole}
                  onChange={(e) => setFormRole(e.target.value)}
                  className="input-field"
                >
                  <option value="admin">Администратор</option>
                  <option value="lawyer">Юрист</option>
                  <option value="viewer">Наблюдатель</option>
                </select>
              </div>

              <div className="flex gap-3 pt-2">
                <button type="submit" disabled={formLoading} className="btn-primary flex-1">
                  {formLoading
                    ? "Сохранение..."
                    : modalMode === "create"
                      ? "Создать"
                      : "Сохранить"}
                </button>
                <button
                  type="button"
                  onClick={closeModal}
                  className="flex-1 px-4 py-2.5 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  Отмена
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
