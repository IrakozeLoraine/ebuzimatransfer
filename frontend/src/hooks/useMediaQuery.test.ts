import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useMediaQuery, useIsDesktop } from "./useMediaQuery";

interface FakeMql {
  matches: boolean;
  listeners: Set<() => void>;
  addEventListener: (t: string, cb: () => void) => void;
  removeEventListener: (t: string, cb: () => void) => void;
  dispatch: () => void;
}

const makeMatchMedia = (initialMatches: boolean) => {
  const mql: FakeMql = {
    matches: initialMatches,
    listeners: new Set(),
    addEventListener: (_t, cb) => mql.listeners.add(cb),
    removeEventListener: (_t, cb) => mql.listeners.delete(cb),
    dispatch: () => mql.listeners.forEach((cb) => cb()),
  };
  const fn = vi.fn(() => mql);
  return { fn, mql };
};

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  // @ts-expect-error clean up the injected matchMedia
  delete window.matchMedia;
});

describe("useMediaQuery", () => {
  it("returns the initial match state on mount", () => {
    const { fn } = makeMatchMedia(true);
    window.matchMedia = fn as unknown as typeof window.matchMedia;

    const { result } = renderHook(() => useMediaQuery("(min-width: 768px)"));

    expect(result.current).toBe(true);
    expect(fn).toHaveBeenCalledWith("(min-width: 768px)");
  });

  it("updates when the media query change event fires", () => {
    const { fn, mql } = makeMatchMedia(false);
    window.matchMedia = fn as unknown as typeof window.matchMedia;

    const { result } = renderHook(() => useMediaQuery("(min-width: 768px)"));
    expect(result.current).toBe(false);

    act(() => {
      mql.matches = true;
      mql.dispatch();
    });

    expect(result.current).toBe(true);
  });

  it("removes its change listener on unmount", () => {
    const { fn, mql } = makeMatchMedia(false);
    window.matchMedia = fn as unknown as typeof window.matchMedia;

    const { unmount } = renderHook(() => useMediaQuery("(max-width: 500px)"));
    expect(mql.listeners.size).toBe(1);

    unmount();
    expect(mql.listeners.size).toBe(0);
  });

  it("useIsDesktop queries the Tailwind md breakpoint", () => {
    const { fn } = makeMatchMedia(true);
    window.matchMedia = fn as unknown as typeof window.matchMedia;

    const { result } = renderHook(() => useIsDesktop());

    expect(fn).toHaveBeenCalledWith("(min-width: 768px)");
    expect(result.current).toBe(true);
  });
});
