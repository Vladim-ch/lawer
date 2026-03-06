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
  isLoading: boolean;
  error: string | null;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, name: string, password: string) => Promise<void>;
  logout: () => void;
  clearError: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      token: null,
      user: null,
      isLoading: false,
      error: null,

      login: async (email, password) => {
        set({ isLoading: true, error: null });
        try {
          const data = await apiFetch<{ token: string; user: User }>("/api/auth/login", {
            method: "POST",
            body: { email, password },
          });
          set({ token: data.token, user: data.user, isLoading: false });
        } catch (err) {
          set({ isLoading: false, error: (err as Error).message });
        }
      },

      register: async (email, name, password) => {
        set({ isLoading: true, error: null });
        try {
          const data = await apiFetch<{ token: string; user: User }>("/api/auth/register", {
            method: "POST",
            body: { email, name, password },
          });
          set({ token: data.token, user: data.user, isLoading: false });
        } catch (err) {
          set({ isLoading: false, error: (err as Error).message });
        }
      },

      logout: () => {
        set({ token: null, user: null });
      },

      clearError: () => {
        set({ error: null });
      },
    }),
    {
      name: "lawer-auth",
      partialize: (state) => ({ token: state.token, user: state.user }),
    },
  ),
);
