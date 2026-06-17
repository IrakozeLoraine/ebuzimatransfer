import { useMutation, useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "@/store/auth.store";
import {
  login as apiLogin,
  setPassword as apiSetPassword,
  getMe,
  logout as apiLogout,
} from "@/api/auth.api";
import type { LoginRequest, SetPasswordRequest } from "@/types/auth";

export const useCompleteAuth = () => {
  const { setTokens, setUser } = useAuthStore();
  const navigate = useNavigate();

  return async (access_token: string, refresh_token: string) => {
    setTokens(access_token, refresh_token);
    const user = await getMe();
    setUser(user);
    navigate("/dashboard");
  };
};

export const useLogin = () => {
  return useMutation({
    mutationFn: (payload: LoginRequest) => apiLogin(payload),
  });
};

export const useSetPassword = () => {
  const completeAuth = useCompleteAuth();

  return useMutation({
    mutationFn: (payload: SetPasswordRequest) => apiSetPassword(payload),
    onSuccess: (data) => {
      if (data.access_token && data.refresh_token) {
        completeAuth(data.access_token, data.refresh_token);
      }
    },
  });
};

export const useLogout = () => {
  const { logout } = useAuthStore();
  const navigate = useNavigate();

  return useMutation({
    mutationFn: apiLogout,
    onSettled: () => {
      logout();
      navigate("/login");
    },
  });
};

export const useCurrentUser = () => {
  const { isAuthenticated, setUser } = useAuthStore();
  return useQuery({
    queryKey: ["me"],
    queryFn: async () => {
      const user = await getMe();
      setUser(user);
      return user;
    },
    enabled: isAuthenticated,
    staleTime: 5 * 60 * 1000,
  });
};
