import { api } from "./axios";
import type { User, CreateUserPayload, UpdateUserPayload, AssignUserPayload, CreateAssignPayload, UserStatusPayload } from "@/types/user";

export const getUsers = async (): Promise<User[]> => {
  const { data } = await api.get<User[]>("/users");
  return data;
};

export const getUser = async (id: string): Promise<User> => {
  const { data } = await api.get<User>(`/users/${id}`);
  return data;
};

export const createUser = async (payload: CreateUserPayload): Promise<User> => {
  const { data } = await api.post<User>("/users", payload);
  return data;
};

export const createAndAssignUser = async (payload: CreateAssignPayload): Promise<User> => {
  const { data } = await api.post<User>("/users/create-and-assign", payload);
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

export const assignUserToSpecificFacility = async (
  facilityId: string,
  payload: AssignUserPayload,
): Promise<User> => {
  const { data } = await api.post<User>(`/users/assign/${facilityId}`, payload);
  return data;
};

export const removeUserFromFacility = async (
  userId: string,
  facilityId: string,
): Promise<User> => {
  const { data } = await api.delete<User>(`/users/${userId}/facilities/${facilityId}`);
  return data;
};

export const updateUserAccountStatus = async (id: string, payload: UserStatusPayload): Promise<User> => {
  const { data } = await api.patch<User>(`/users/${id}/status`, payload);
  return data;
};
