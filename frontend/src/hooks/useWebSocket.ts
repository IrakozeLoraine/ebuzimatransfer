import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "@/store/auth.store";
import { useNotificationStore } from "@/store/notification.store";

const WS_BASE = import.meta.env.VITE_WS_BASE_URL;

export const useCapacityWebSocket = () => {
  const queryClient = useQueryClient();
  const ws = useRef<WebSocket | null>(null);

  useEffect(() => {
    ws.current = new WebSocket(`${WS_BASE}/ws/capacity`);
    ws.current.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      if (msg.event === "RESOURCE_UPDATED") {
        queryClient.invalidateQueries({ queryKey: ["capacity"] });
        queryClient.invalidateQueries({ queryKey: ["dashboard"] });
        queryClient.invalidateQueries({ queryKey: ["resources"] });
      }
    };
    return () => ws.current?.close();
  }, [queryClient]);
};

export const useReferralsWebSocket = () => {
  const queryClient = useQueryClient();
  const ws = useRef<WebSocket | null>(null);

  useEffect(() => {
    ws.current = new WebSocket(`${WS_BASE}/ws/referrals`);
    ws.current.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      if (msg.referral_id) {
        queryClient.invalidateQueries({ queryKey: ["referrals"] });
        queryClient.invalidateQueries({ queryKey: ["referral", msg.referral_id] });
      }
    };
    return () => ws.current?.close();
  }, [queryClient]);
};

export const useNotificationsWebSocket = () => {
  const { accessToken } = useAuthStore();
  const { addNotification } = useNotificationStore();
  const ws = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!accessToken) return;
    ws.current = new WebSocket(`${WS_BASE}/ws/notifications?token=${accessToken}`);
    ws.current.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      if (msg.title && msg.message) {
        addNotification({
          id: crypto.randomUUID(),
          title: msg.title,
          message: msg.message,
          event_type: msg.event ?? null,
          entity_type: null,
          entity_id: null,
          is_read: false,
          created_at: new Date().toISOString(),
        });
      }
    };
    return () => ws.current?.close();
  }, [accessToken, addNotification]);
};
