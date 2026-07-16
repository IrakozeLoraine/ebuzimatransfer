import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useGeolocation } from "./useGeolocation";

type SuccessCb = (pos: GeolocationPosition) => void;
type ErrorCb = (err: GeolocationPositionError) => void;

let successCb: SuccessCb | null;
let errorCb: ErrorCb | null;
let watchPosition: ReturnType<typeof vi.fn>;
let clearWatch: ReturnType<typeof vi.fn>;

const installGeolocation = () => {
  watchPosition = vi.fn((s: SuccessCb, e: ErrorCb) => {
    successCb = s;
    errorCb = e;
    return 42;
  });
  clearWatch = vi.fn();
  Object.defineProperty(navigator, "geolocation", {
    configurable: true,
    value: { watchPosition, clearWatch },
  });
};

const removeGeolocation = () => {
  // Delete so `"geolocation" in navigator` is false (support check).
  delete (navigator as { geolocation?: unknown }).geolocation;
};

const setSecure = (secure: boolean) => {
  Object.defineProperty(window, "isSecureContext", {
    configurable: true,
    value: secure,
  });
};

const makePosition = (over: Partial<GeolocationCoordinates> = {}): GeolocationPosition =>
  ({
    coords: {
      latitude: -1.95,
      longitude: 30.06,
      accuracy: 5,
      heading: 90,
      speed: 12,
      altitude: null,
      altitudeAccuracy: null,
      ...over,
    },
    timestamp: 1_700_000_000,
  }) as GeolocationPosition;

beforeEach(() => {
  successCb = null;
  errorCb = null;
  installGeolocation();
  setSecure(true);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useGeolocation", () => {
  it("reports support and secure context", () => {
    const { result } = renderHook(() => useGeolocation());
    expect(result.current.supported).toBe(true);
    expect(result.current.secure).toBe(true);
    expect(result.current.watching).toBe(false);
    expect(result.current.position).toBeNull();
  });

  it("starts a watch and stores an incoming fix", () => {
    const { result } = renderHook(() => useGeolocation());

    act(() => result.current.start());
    expect(result.current.watching).toBe(true);
    expect(watchPosition).toHaveBeenCalledTimes(1);

    act(() => successCb!(makePosition()));

    expect(result.current.position).toEqual({
      latitude: -1.95,
      longitude: 30.06,
      accuracy: 5,
      heading: 90,
      speed: 12,
      timestamp: 1_700_000_000,
    });
    expect(result.current.error).toBeNull();
  });

  it("normalises non-finite heading and speed to null", () => {
    const { result } = renderHook(() => useGeolocation());
    act(() => result.current.start());
    act(() => successCb!(makePosition({ heading: null, speed: null })));

    expect(result.current.position?.heading).toBeNull();
    expect(result.current.position?.speed).toBeNull();
  });

  it("surfaces a friendly message and releases the watch on permission denied", () => {
    const { result } = renderHook(() => useGeolocation());
    act(() => result.current.start());

    act(() =>
      errorCb!({
        code: 1,
        PERMISSION_DENIED: 1,
        message: "denied",
      } as GeolocationPositionError)
    );

    expect(result.current.error).toMatch(/permission denied/i);
    expect(result.current.watching).toBe(false);
    expect(clearWatch).toHaveBeenCalledWith(42);
  });

  it("uses the raw message for non-permission errors without stopping", () => {
    const { result } = renderHook(() => useGeolocation());
    act(() => result.current.start());

    act(() =>
      errorCb!({
        code: 2,
        PERMISSION_DENIED: 1,
        message: "position unavailable",
      } as GeolocationPositionError)
    );

    expect(result.current.error).toBe("position unavailable");
    expect(result.current.watching).toBe(true);
    expect(clearWatch).not.toHaveBeenCalled();
  });

  it("falls back to a generic message when the error has none", () => {
    const { result } = renderHook(() => useGeolocation());
    act(() => result.current.start());

    act(() =>
      errorCb!({ code: 3, PERMISSION_DENIED: 1, message: "" } as GeolocationPositionError)
    );

    expect(result.current.error).toBe("Couldn't get your location.");
  });

  it("stop() clears an active watch", () => {
    const { result } = renderHook(() => useGeolocation());
    act(() => result.current.start());
    act(() => result.current.stop());

    expect(clearWatch).toHaveBeenCalledWith(42);
    expect(result.current.watching).toBe(false);
  });

  it("stop() is a no-op when no watch is active", () => {
    const { result } = renderHook(() => useGeolocation());
    act(() => result.current.stop());
    expect(clearWatch).not.toHaveBeenCalled();
  });

  it("releases the watch on unmount", () => {
    const { result, unmount } = renderHook(() => useGeolocation());
    act(() => result.current.start());
    unmount();
    expect(clearWatch).toHaveBeenCalledWith(42);
  });

  it("errors when geolocation is unsupported", () => {
    removeGeolocation();
    const { result } = renderHook(() => useGeolocation());
    expect(result.current.supported).toBe(false);

    act(() => result.current.start());

    expect(result.current.error).toMatch(/isn't supported/i);
    expect(result.current.watching).toBe(false);
  });

  it("errors when the context is not secure", () => {
    setSecure(false);
    const { result } = renderHook(() => useGeolocation());
    expect(result.current.secure).toBe(false);

    act(() => result.current.start());

    expect(result.current.error).toMatch(/secure \(HTTPS\)/i);
    expect(watchPosition).not.toHaveBeenCalled();
  });
});
