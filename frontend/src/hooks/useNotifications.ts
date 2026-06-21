import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import {
  getNotifications,
  markNotificationRead,
  markAllNotificationsRead,
} from "@/api/notifications.api";
import { useNotificationStore } from "@/store/notification.store";

export const useNotifications = () => {
  const { setNotifications } = useNotificationStore();

  const query = useQuery({
    queryKey: ["notifications"],
    queryFn: () => getNotifications(),
    staleTime: 60_000,
  });

  useEffect(() => {
    if (query.data) {
      setNotifications(query.data);
    }
  }, [query.data, setNotifications]);

  return query;
};

export const useMarkRead = () => {
  const qc = useQueryClient();
  const { markRead } = useNotificationStore();
  return useMutation({
    mutationFn: (id: string) => markNotificationRead(id),
    onMutate: (id) => markRead(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });
};

export const useMarkAllRead = () => {
  const qc = useQueryClient();
  const { markAllRead } = useNotificationStore();
  return useMutation({
    mutationFn: markAllNotificationsRead,
    onMutate: () => markAllRead(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });
};
