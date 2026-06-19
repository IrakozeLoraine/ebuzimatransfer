import { api } from "./axios";
import type { User, CreateUserPayload, UpdateUserPayload, AssignUserPayload, UserStatusPayload } from "@/types/user";

export const getUsers = async (): Promise<User[]> => {
  const { data } = await api.get<User[]>("/users");
  return data;
};

export const createUser = async (payload: CreateUserPayload): Promise<User> => {
  const { data } = await api.post<User>("/users", payload);
  return data;
};

export const updateUser = async (id: string, payload: UpdateUserPayload): Promise<User> => {
  const { data } = await api.put<User>(`/users/${id}`, payload);
  return data;
};

export const deactivateUser = async (id: string): Promise<void> => {
  await api.delete(`/users/${id}`);
};

export const assignUserToFacility = async (payload: AssignUserPayload): Promise<User> => {
  const { data } = await api.post<User>("/users/assign", payload);
  return data;
};

export const updateUserAccountStatus = async (id: string, payload: UserStatusPayload): Promise<User> => {
  const { data } = await api.patch<User>(`/users/${id}/status`, payload);
  return data;
};
