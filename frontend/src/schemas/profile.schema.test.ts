import { describe, it, expect } from "vitest";
import { editProfileSchema, changePasswordSchema } from "./profile.schema";

describe("editProfileSchema", () => {
  it("accepts an empty profile (all fields optional)", () => {
    expect(editProfileSchema.safeParse({}).success).toBe(true);
  });

  it("accepts a valid email and location", () => {
    expect(editProfileSchema.safeParse({ email: "a@b.rw", location: "Kigali" }).success).toBe(true);
  });

  it("rejects a malformed email", () => {
    expect(editProfileSchema.safeParse({ email: "nope" }).success).toBe(false);
  });
});

describe("changePasswordSchema", () => {
  const base = { current_password: "old-pass", new_password: "new-password", confirm_password: "new-password" };

  it("accepts matching passwords of sufficient length", () => {
    expect(changePasswordSchema.safeParse(base).success).toBe(true);
  });

  it("rejects a new password shorter than 8 characters", () => {
    expect(changePasswordSchema.safeParse({ ...base, new_password: "short", confirm_password: "short" }).success).toBe(false);
  });

  it("rejects when confirmation does not match", () => {
    const result = changePasswordSchema.safeParse({ ...base, confirm_password: "different-one" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].path).toContain("confirm_password");
    }
  });

  it("requires a current password", () => {
    expect(changePasswordSchema.safeParse({ ...base, current_password: "" }).success).toBe(false);
  });
});
