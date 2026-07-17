import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { UserMe } from '@/types/auth';

interface AuthState {
  user: UserMe | null;
  accessToken: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;
  /** Whether the user has confirmed which facility/unit they're working in this
   *  session. Reset on each fresh login so an ambiguous user is prompted to pick. */
  contextConfirmed: boolean;
  setTokens: (access: string, refresh: string) => void;
  setUser: (user: UserMe) => void;
  setContextConfirmed: (confirmed: boolean) => void;
  logout: () => void;
  hasRole: (role: string) => boolean;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      isAuthenticated: false,
      contextConfirmed: false,

      setTokens: (access, refresh) => {
        localStorage.setItem("access_token", access);
        localStorage.setItem("refresh_token", refresh);
        set({ accessToken: access, refreshToken: refresh, isAuthenticated: true });
      },

      setUser: (user) => set({ user }),

      setContextConfirmed: (confirmed) => set({ contextConfirmed: confirmed }),

      logout: () => {
        localStorage.removeItem("access_token");
        localStorage.removeItem("refresh_token");
        set({
          user: null,
          accessToken: null,
          refreshToken: null,
          isAuthenticated: false,
          contextConfirmed: false,
        });
      },

      hasRole: (role) => get().user?.roles.includes(role) ?? false,
    }),
    {
      name: "auth-store",
      partialize: (state) => ({
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
        isAuthenticated: state.isAuthenticated,
        user: state.user,
        contextConfirmed: state.contextConfirmed,
      }),
    }
  )
);
