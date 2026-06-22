import { api } from "./axios";
import type { Notification } from "@/types/notification";

export const getNotifications = async (unread_only = false): Promise<Notification[]> => {
  const { data } = await api.get<Notification[]>("/notifications", {
    params: unread_only ? { unread_only: true } : undefined,
  });
  return data;
};

export const getUnreadCount = async (): Promise<number> => {
  const { data } = await api.get<{ count: number }>("/notifications/unread-count");
  return data.count;
};

export const markNotificationRead = async (id: string): Promise<void> => {
  await api.patch(`/notifications/${id}/read`);
};

export const markAllNotificationsRead = async (): Promise<void> => {
  await api.patch("/notifications/mark-all-read");
};
