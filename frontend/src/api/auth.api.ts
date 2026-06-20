import { api } from "./axios";
import type { LoginRequest, SetPasswordRequest, TokenResponse, UserMe } from "@/types/auth";

export const login = async (payload: LoginRequest): Promise<TokenResponse> => {
  const { data } = await api.post<TokenResponse>("/auth/login", payload);
  return data;
};

export const setPassword = async (payload: SetPasswordRequest): Promise<TokenResponse> => {
  const { data } = await api.post<TokenResponse>("/auth/set-password", payload);
  return data;
};

export const refreshToken = async (token: string): Promise<TokenResponse> => {
  const { data } = await api.post<TokenResponse>("/auth/refresh", { refresh_token: token });
  return data;
};

export const switchFacility = async (facility_id: string): Promise<TokenResponse> => {
  const { data } = await api.post<TokenResponse>("/auth/switch-facility", { facility_id });
  return data;
};

export const logout = async (): Promise<void> => {
  await api.post("/auth/logout");
};

export const getMe = async (): Promise<UserMe> => {
  const { data } = await api.get<UserMe>("/auth/me");
  return data;
};

export const changePassword = async (current_password: string, new_password: string): Promise<void> => {
  await api.post("/auth/change-password", { current_password, new_password });
};
