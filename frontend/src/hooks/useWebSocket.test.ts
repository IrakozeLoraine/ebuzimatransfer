import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { createQueryWrapper } from "@/test/queryWrapper";
import {
  useCapacityWebSocket,
  useAmbulanceWebSocket,
  useReferralsWebSocket,
  useNotificationsWebSocket,
} from "./useWebSocket";
import { useAuthStore } from "@/store/auth.store";
import { useNotificationStore } from "@/store/notification.store";
import type { User } from "@/types/auth";

class FakeWebSocket {
  static instances: FakeWebSocket[] = [];
  url: string;
  onmessage: ((e: { data: string }) => void) | null = null;
  close = vi.fn();

  constructor(url: string) {
    this.url = url;
    FakeWebSocket.instances.push(this);
  }

  emit(payload: unknown) {
    this.onmessage?.({ data: JSON.stringify(payload) });
  }

  static last() {
    return FakeWebSocket.instances[FakeWebSocket.instances.length - 1];
  }
}

beforeEach(() => {
  FakeWebSocket.instances = [];
  vi.stubGlobal("WebSocket", FakeWebSocket as unknown as typeof WebSocket);
  useNotificationStore.setState({ notifications: [], unreadCount: 0 });
  useAuthStore.setState({ user: null, token: null } as never);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useCapacityWebSocket", () => {
  it("connects to the capacity channel and invalidates capacity queries on update", () => {
    const { wrapper, queryClient } = createQueryWrapper();
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");

    renderHook(() => useCapacityWebSocket(), { wrapper });
    const socket = FakeWebSocket.last();
    expect(socket.url).toMatch(/\/ws\/capacity$/);

    socket.emit({ event: "RESOURCE_UPDATED" });

    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["capacity"] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["dashboard"] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["resources"] });
  });

  it("ignores unrelated events", () => {
    const { wrapper, queryClient } = createQueryWrapper();
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");

    renderHook(() => useCapacityWebSocket(), { wrapper });
    FakeWebSocket.last().emit({ event: "SOMETHING_ELSE" });

    expect(invalidate).not.toHaveBeenCalled();
  });

  it("closes the socket on unmount", () => {
    const { wrapper } = createQueryWrapper();
    const { unmount } = renderHook(() => useCapacityWebSocket(), { wrapper });
    const socket = FakeWebSocket.last();
    unmount();
    expect(socket.close).toHaveBeenCalled();
  });
});

describe("useAmbulanceWebSocket", () => {
  it("does not open a socket without a referral id", () => {
    const { wrapper } = createQueryWrapper();
    renderHook(() => useAmbulanceWebSocket(undefined), { wrapper });
    expect(FakeWebSocket.instances).toHaveLength(0);
  });

  it("subscribes to the per-referral channel and invalidates the track on ping", () => {
    const { wrapper, queryClient } = createQueryWrapper();
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");

    renderHook(() => useAmbulanceWebSocket("ref-1"), { wrapper });
    const socket = FakeWebSocket.last();
    expect(socket.url).toMatch(/\/ws\/ambulance:ref-1$/);

    socket.emit({ event: "AMBULANCE_PING" });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["ambulance-track", "ref-1"] });

    socket.emit({ event: "NOISE" });
    expect(invalidate).toHaveBeenCalledTimes(1);
  });
});

describe("useReferralsWebSocket", () => {
  it("invalidates referral queries when a referral id is present", () => {
    const { wrapper, queryClient } = createQueryWrapper();
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");

    renderHook(() => useReferralsWebSocket(), { wrapper });
    const socket = FakeWebSocket.last();
    expect(socket.url).toMatch(/\/ws\/referrals$/);

    socket.emit({ referral_id: "ref-9" });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["referrals"] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["referral", "ref-9"] });

    socket.emit({ foo: "bar" });
    expect(invalidate).toHaveBeenCalledTimes(2);
  });
});

describe("useNotificationsWebSocket", () => {
  it("does not connect when no user is authenticated", () => {
    const { wrapper } = createQueryWrapper();
    renderHook(() => useNotificationsWebSocket(), { wrapper });
    expect(FakeWebSocket.instances).toHaveLength(0);
  });

  it("pushes an incoming notification into the store and invalidates queries", () => {
    useAuthStore.setState({ user: { id: "u-1" } as User } as never);
    const { wrapper, queryClient } = createQueryWrapper();
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");

    renderHook(() => useNotificationsWebSocket(), { wrapper });
    const socket = FakeWebSocket.last();
    expect(socket.url).toMatch(/\/ws\/user:u-1$/);

    socket.emit({ title: "New transfer", message: "A patient was referred", event: "REFERRAL_CREATED" });

    const stored = useNotificationStore.getState().notifications;
    expect(stored).toHaveLength(1);
    expect(stored[0].title).toBe("New transfer");
    expect(stored[0].event_type).toBe("REFERRAL_CREATED");
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["notifications"] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["referrals"] });
  });

  it("defaults event_type to null when the event field is missing", () => {
    useAuthStore.setState({ user: { id: "u-2" } as User } as never);
    const { wrapper } = createQueryWrapper();

    renderHook(() => useNotificationsWebSocket(), { wrapper });
    FakeWebSocket.last().emit({ title: "Hi", message: "there" });

    expect(useNotificationStore.getState().notifications[0].event_type).toBeNull();
  });

  it("ignores malformed payloads lacking title or message", () => {
    useAuthStore.setState({ user: { id: "u-3" } as User } as never);
    const { wrapper } = createQueryWrapper();

    renderHook(() => useNotificationsWebSocket(), { wrapper });
    FakeWebSocket.last().emit({ title: "only title" });

    expect(useNotificationStore.getState().notifications).toHaveLength(0);
  });
});
