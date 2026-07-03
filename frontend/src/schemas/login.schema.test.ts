import { describe, it, expect } from "vitest";
import {
  medicalIdSchema,
  passwordSchema,
  setPasswordSchema,
} from "./login.schema";

describe("medicalIdSchema", () => {
  it("accepts a medical id of at least 3 characters", () => {
    expect(medicalIdSchema.safeParse({ medical_id: "MD1" }).success).toBe(true);
  });

  it("rejects a short medical id", () => {
    const result = medicalIdSchema.safeParse({ medical_id: "ab" });
    expect(result.success).toBe(false);
  });
});

describe("passwordSchema", () => {
  it("requires at least 6 characters", () => {
    expect(passwordSchema.safeParse({ password: "123456" }).success).toBe(true);
    expect(passwordSchema.safeParse({ password: "12345" }).success).toBe(false);
  });
});

describe("setPasswordSchema", () => {
  it("accepts matching passwords of 8+ characters", () => {
    const result = setPasswordSchema.safeParse({
      new_password: "supersecret",
      confirm_password: "supersecret",
    });
    expect(result.success).toBe(true);
  });

  it("rejects mismatched passwords and reports on confirm_password", () => {
    const result = setPasswordSchema.safeParse({
      new_password: "supersecret",
      confirm_password: "different1",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].path).toEqual(["confirm_password"]);
      expect(result.error.issues[0].message).toBe("Passwords do not match");
    }
  });

  it("rejects a new password shorter than 8 characters", () => {
    const result = setPasswordSchema.safeParse({
      new_password: "short",
      confirm_password: "short",
    });
    expect(result.success).toBe(false);
  });
});
