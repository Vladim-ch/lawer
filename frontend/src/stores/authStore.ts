import { create } from "zustand";
import { persist } from "zustand/middleware";
import { apiFetch } from "@/lib/api";

interface User {
  id: string;
  email: string;
  name: string;
  role: string;
}

interface AuthState {
  token: string | null;
  user: User | null;
  mustChangePassword: boolean;
  isLoading: boolean;
  error: string | null;
  login: (email: string, password: string) => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
  logout: () => void;
  clearError: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      token: null,
      user: null,
      mustChangePassword: false,
      isLoading: false,
      error: null,

      login: async (email, password) => {
        set({ isLoading: true, error: null });
        try {
          const data = await apiFetch<{ token: string; user: User; mustChangePassword: boolean }>("/api/auth/login", {
            method: "POST",
            body: { email, password },
          });
          set({
            token: data.token,
            user: data.user,
            mustChangePassword: data.mustChangePassword ?? false,
            isLoading: false,
          });
        } catch (err) {
          set({ isLoading: false, error: (err as Error).message });
        }
      },

      changePassword: async (currentPassword, newPassword) => {
        set({ isLoading: true, error: null });
        try {
          const token = get().token;
          await apiFetch("/api/auth/change-password", {
            method: "POST",
            body: { currentPassword, newPassword },
            token: token || undefined,
          });
          set({ mustChangePassword: false, isLoading: false });
        } catch (err) {
          set({ isLoading: false, error: (err as Error).message });
        }
      },

      logout: () => {
        set({ token: null, user: null, mustChangePassword: false });
      },

      clearError: () => {
        set({ error: null });
      },
    }),
    {
      name: "lawer-auth",
      partialize: (state) => ({
        token: state.token,
        user: state.user,
        mustChangePassword: state.mustChangePassword,
      }),
    },
  ),
);
