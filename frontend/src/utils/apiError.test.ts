import { describe, it, expect } from "vitest";
import { AxiosError } from "axios";
import { getApiErrorMessage } from "./apiError";

/** Build a minimal AxiosError carrying the given `detail` response body. */
const axiosErrorWithDetail = (detail: unknown): AxiosError => {
  const err = new AxiosError("Request failed");
  err.response = {
    data: { detail },
    status: 400,
    statusText: "Bad Request",
    headers: {},
    config: {} as never,
  };
  return err;
};

describe("getApiErrorMessage", () => {
  it("returns a string detail verbatim", () => {
    const err = axiosErrorWithDetail("Facility not found");
    expect(getApiErrorMessage(err)).toBe("Facility not found");
  });

  it("formats FastAPI validation arrays as 'field: msg'", () => {
    const err = axiosErrorWithDetail([
      { loc: ["body", "email"], msg: "invalid email" },
      { loc: ["body", "password"], msg: "too short" },
    ]);
    expect(getApiErrorMessage(err)).toBe(
      "email: invalid email; password: too short"
    );
  });

  it("uses the bare msg when a validation entry has no loc", () => {
    const err = axiosErrorWithDetail([{ msg: "generic failure" }]);
    expect(getApiErrorMessage(err)).toBe("generic failure");
  });

  it("falls back when a validation array yields no usable messages", () => {
    const err = axiosErrorWithDetail([{ loc: ["body"] }]);
    expect(getApiErrorMessage(err, "custom fallback")).toBe("custom fallback");
  });

  it("uses the fallback when an AxiosError has no message or detail", () => {
    const err = new AxiosError("");
    err.message = "";
    expect(getApiErrorMessage(err, "final fallback")).toBe("final fallback");
  });

  it("reads a nested detail.message object", () => {
    const err = axiosErrorWithDetail({ message: "Rate limited" });
    expect(getApiErrorMessage(err)).toBe("Rate limited");
  });

  it("falls back to error.message when detail is absent", () => {
    const err = new AxiosError("Network Error");
    expect(getApiErrorMessage(err)).toBe("Network Error");
  });

  it("unwraps a plain Error", () => {
    expect(getApiErrorMessage(new Error("boom"))).toBe("boom");
  });

  it("uses the fallback for unknown throwables", () => {
    expect(getApiErrorMessage("nope", "default msg")).toBe("default msg");
  });
});
