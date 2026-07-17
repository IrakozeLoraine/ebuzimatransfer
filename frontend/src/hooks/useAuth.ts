import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "@/store/auth.store";
import {
  login as apiLogin,
  setPassword as apiSetPassword,
  getMe,
  logout as apiLogout,
  switchFacility as apiSwitchFacility,
  switchContext as apiSwitchContext,
  updateProfile as apiUpdateProfile,
  changePassword as apiChangePassword,
} from "@/api/auth.api";
import { toast } from "@/components/ui/toaster";
import { getApiErrorMessage } from "@/utils/apiError";
import type { LoginRequest, SetPasswordRequest, UpdateProfilePayload } from "@/types/auth";

export const useCompleteAuth = () => {
  const { setTokens, setUser, setContextConfirmed } = useAuthStore();
  const navigate = useNavigate();

  return async (access_token: string, refresh_token: string) => {
    setTokens(access_token, refresh_token);
    // A fresh sign-in hasn't picked a working context yet — the app's ContextPicker
    // prompts when the facility/unit choice is ambiguous.
    setContextConfirmed(false);
    const user = await getMe();
    setUser(user);
    const isAdmin = user.roles.some((r) => r === "SUPER_ADMIN" || r === "FACILITY_ADMIN");
    navigate(isAdmin ? "/dashboard" : "/find-resources");
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

export const useSwitchFacility = () => {
  const { setTokens, setUser } = useAuthStore();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (facilityId: string) => {
      const tokens = await apiSwitchFacility(facilityId);
      if (tokens.access_token && tokens.refresh_token) {
        setTokens(tokens.access_token, tokens.refresh_token);
      }
      const user = await getMe();
      setUser(user);
      return user;
    },
    onSuccess: (user) => {
      // Data is facility-scoped — refetch everything for the new active facility.
      qc.invalidateQueries();
      const active = user.facilities.find((f) => f.id === user.active_facility_id);
      toast({ variant: "success", title: `Switched to ${active?.name ?? "facility"}` });
    },
    onError: (error) => {
      toast({
        variant: "destructive",
        title: "Failed to switch facility",
        description: getApiErrorMessage(error),
      });
    },
  });
};

export const useSwitchContext = () => {
  const { setTokens, setUser, setContextConfirmed } = useAuthStore();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ facilityId, unitId }: { facilityId: string; unitId?: string | null }) => {
      const tokens = await apiSwitchContext(facilityId, unitId ?? null);
      if (tokens.access_token && tokens.refresh_token) {
        setTokens(tokens.access_token, tokens.refresh_token);
      }
      const user = await getMe();
      setUser(user);
      setContextConfirmed(true);
      return user;
    },
    onSuccess: () => {
      // Data is facility/unit-scoped — refetch everything for the new context.
      qc.invalidateQueries();
    },
    onError: (error) => {
      toast({
        variant: "destructive",
        title: "Failed to switch",
        description: getApiErrorMessage(error),
      });
    },
  });
};

export const useUpdateProfile = () => {
  const { setUser } = useAuthStore();
  return useMutation({
    mutationFn: (payload: UpdateProfilePayload) => apiUpdateProfile(payload),
    onSuccess: (user) => {
      setUser(user);
      toast({ variant: "success", title: "Profile updated" });
    },
    onError: (error) =>
      toast({ variant: "destructive", title: "Could not update profile", description: getApiErrorMessage(error) }),
  });
};

export const useChangePassword = () =>
  useMutation({
    mutationFn: ({ currentPassword, newPassword }: { currentPassword: string; newPassword: string }) =>
      apiChangePassword(currentPassword, newPassword),
    onSuccess: () => toast({ variant: "success", title: "Password updated" }),
    onError: (error) =>
      toast({ variant: "destructive", title: "Could not change password", description: getApiErrorMessage(error) }),
  });

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
