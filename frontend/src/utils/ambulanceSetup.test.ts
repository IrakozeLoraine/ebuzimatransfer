import { describe, it, expect, afterEach, vi } from "vitest";
import { buildSetupQr, driverServerUrl } from "./ambulanceSetup";

describe("buildSetupQr", () => {
  it("encodes the versioned QR payload the Flutter app expects", () => {
    const qr = buildSetupQr({
      serverUrl: "https://app.example.rw",
      loginId: "AMB-01",
      password: "Xy7k-9Qmn",
    });
    expect(JSON.parse(qr)).toEqual({
      v: 1,
      url: "https://app.example.rw",
      id: "AMB-01",
      pw: "Xy7k-9Qmn",
    });
  });
});

describe("driverServerUrl", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns the window origin when the API base is a relative path", () => {
    vi.stubEnv("VITE_API_BASE_URL", "/api/v1");
    expect(driverServerUrl()).toBe(window.location.origin);
  });

  it("falls back to the default relative base when the env var is unset", () => {
    vi.stubEnv("VITE_API_BASE_URL", undefined);
    expect(driverServerUrl()).toBe(window.location.origin);
  });

  it("returns the origin of an absolute API base URL", () => {
    vi.stubEnv("VITE_API_BASE_URL", "https://api.example.rw:8443/api/v1");
    expect(driverServerUrl()).toBe("https://api.example.rw:8443");
  });
});
