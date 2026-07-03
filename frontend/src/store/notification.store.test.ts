import { describe, it, expect, beforeEach } from "vitest";
import { useNotificationStore } from "./notification.store";
import type { Notification } from "@/types/notification";

const makeNotification = (id: string, is_read = false): Notification =>
  ({ id, is_read, title: `n-${id}`, body: "", created_at: "2026-01-01T00:00:00Z" } as Notification);

const reset = () => useNotificationStore.setState({ notifications: [], unreadCount: 0 });

describe("notification.store", () => {
  beforeEach(reset);

  it("setNotifications replaces the list and counts the unread ones", () => {
    useNotificationStore.getState().setNotifications([
      makeNotification("1", false),
      makeNotification("2", true),
      makeNotification("3", false),
    ]);
    const state = useNotificationStore.getState();
    expect(state.notifications).toHaveLength(3);
    expect(state.unreadCount).toBe(2);
  });

  it("addNotification prepends and increments the unread count for unread items", () => {
    useNotificationStore.getState().setNotifications([makeNotification("1", false)]);
    useNotificationStore.getState().addNotification(makeNotification("2", false));

    const state = useNotificationStore.getState();
    expect(state.notifications[0].id).toBe("2");
    expect(state.unreadCount).toBe(2);
  });

  it("addNotification does not increment the count for an already-read item", () => {
    useNotificationStore.getState().addNotification(makeNotification("1", true));
    expect(useNotificationStore.getState().unreadCount).toBe(0);
  });

  it("markRead flags one notification and decrements the count without going negative", () => {
    useNotificationStore.getState().setNotifications([makeNotification("1", false)]);
    useNotificationStore.getState().markRead("1");
    expect(useNotificationStore.getState().notifications[0].is_read).toBe(true);
    expect(useNotificationStore.getState().unreadCount).toBe(0);

    // A second call must not push the count below zero.
    useNotificationStore.getState().markRead("1");
    expect(useNotificationStore.getState().unreadCount).toBe(0);
  });

  it("markAllRead flags everything and zeroes the count", () => {
    useNotificationStore.getState().setNotifications([
      makeNotification("1", false),
      makeNotification("2", false),
    ]);
    useNotificationStore.getState().markAllRead();

    const state = useNotificationStore.getState();
    expect(state.notifications.every((n) => n.is_read)).toBe(true);
    expect(state.unreadCount).toBe(0);
  });
});
