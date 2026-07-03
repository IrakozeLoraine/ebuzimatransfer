import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { createQueryWrapper } from "@/test/queryWrapper";
import { useNotifications, useMarkRead, useMarkAllRead } from "./useNotifications";
import { useNotificationStore } from "@/store/notification.store";
import * as notificationsApi from "@/api/notifications.api";
import type { Notification } from "@/types/notification";

vi.mock("@/api/notifications.api");
const mocked = vi.mocked(notificationsApi);

const makeNotification = (id: string, is_read = false): Notification => ({
  id,
  is_read,
  title: `n-${id}`,
  message: "",
  event_type: null,
  entity_type: null,
  entity_id: null,
  created_at: "2026-01-01T00:00:00Z",
});

beforeEach(() => {
  vi.clearAllMocks();
  useNotificationStore.setState({ notifications: [], unreadCount: 0 });
});

describe("useNotifications", () => {
  it("fetches notifications and syncs them into the store", async () => {
    mocked.getNotifications.mockResolvedValue([makeNotification("1", false), makeNotification("2", true)]);
    const { wrapper } = createQueryWrapper();

    const { result } = renderHook(() => useNotifications(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    await waitFor(() => expect(useNotificationStore.getState().notifications).toHaveLength(2));
    expect(useNotificationStore.getState().unreadCount).toBe(1);
  });
});

describe("useMarkRead", () => {
  it("optimistically marks the notification read then invalidates the query", async () => {
    mocked.markNotificationRead.mockResolvedValue(undefined as never);
    useNotificationStore.getState().setNotifications([makeNotification("1", false)]);
    const { wrapper, queryClient } = createQueryWrapper();
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useMarkRead(), { wrapper });
    await result.current.mutateAsync("1");

    expect(mocked.markNotificationRead).toHaveBeenCalledWith("1");
    expect(useNotificationStore.getState().notifications[0].is_read).toBe(true);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["notifications"] });
  });
});

describe("useMarkAllRead", () => {
  it("optimistically clears the unread count then invalidates the query", async () => {
    mocked.markAllNotificationsRead.mockResolvedValue(undefined as never);
    useNotificationStore.getState().setNotifications([makeNotification("1", false), makeNotification("2", false)]);
    const { wrapper, queryClient } = createQueryWrapper();
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useMarkAllRead(), { wrapper });
    await result.current.mutateAsync();

    expect(mocked.markAllNotificationsRead).toHaveBeenCalled();
    expect(useNotificationStore.getState().unreadCount).toBe(0);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["notifications"] });
  });
});
