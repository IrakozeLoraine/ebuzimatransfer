import { describe, it, expect } from "vitest";
import { userSchema, assignUserSchema, createAssignSchema, editUserSchema } from "./user.schema";

describe("userSchema", () => {
  const valid = { medical_id: "MD123", first_name: "Ada", last_name: "Uwase" };

  it("accepts a minimal valid user without an email", () => {
    expect(userSchema.safeParse(valid).success).toBe(true);
  });

  it("accepts a valid optional email", () => {
    expect(userSchema.safeParse({ ...valid, email: "ada@chuk.rw" }).success).toBe(true);
  });

  it("rejects a malformed email", () => {
    expect(userSchema.safeParse({ ...valid, email: "not-an-email" }).success).toBe(false);
  });

  it("rejects a too-short medical id", () => {
    expect(userSchema.safeParse({ ...valid, medical_id: "MD" }).success).toBe(false);
  });

  it("rejects a missing first name", () => {
    expect(userSchema.safeParse({ ...valid, first_name: "" }).success).toBe(false);
  });
});

describe("assignUserSchema", () => {
  it("requires at least one role", () => {
    expect(assignUserSchema.safeParse({ roles: [] }).success).toBe(false);
    expect(assignUserSchema.safeParse({ roles: ["CLINICIAN"] }).success).toBe(true);
  });
});

describe("createAssignSchema", () => {
  it("requires medical id, names and a role", () => {
    expect(
      createAssignSchema.safeParse({
        medical_id: "MD123",
        first_name: "Ada",
        last_name: "Uwase",
        roles: ["CLINICIAN"],
      }).success,
    ).toBe(true);
    expect(createAssignSchema.safeParse({ medical_id: "MD123", first_name: "Ada", last_name: "Uwase", roles: [] }).success).toBe(false);
  });
});

describe("editUserSchema", () => {
  it("validates names and the optional email", () => {
    expect(editUserSchema.safeParse({ first_name: "Ada", last_name: "Uwase" }).success).toBe(true);
    expect(editUserSchema.safeParse({ first_name: "Ada", last_name: "Uwase", email: "bad" }).success).toBe(false);
  });
});
