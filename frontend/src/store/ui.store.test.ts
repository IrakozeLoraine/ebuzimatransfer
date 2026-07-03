import { describe, it, expect, beforeEach } from "vitest";
import { useUiStore } from "./ui.store";

describe("ui.store", () => {
  beforeEach(() => useUiStore.setState({ mobileNavOpen: false }));

  it("defaults the mobile nav to closed", () => {
    expect(useUiStore.getState().mobileNavOpen).toBe(false);
  });

  it("setMobileNavOpen toggles the mobile nav open and closed", () => {
    useUiStore.getState().setMobileNavOpen(true);
    expect(useUiStore.getState().mobileNavOpen).toBe(true);

    useUiStore.getState().setMobileNavOpen(false);
    expect(useUiStore.getState().mobileNavOpen).toBe(false);
  });
});
