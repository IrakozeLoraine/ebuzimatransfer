import { describe, it, expect } from "vitest";
import { facilitySchema } from "./facility.schema";

describe("facilitySchema", () => {
  it("accepts a facility with the required name and type", () => {
    expect(facilitySchema.safeParse({ name: "CHUK", type: "HOSPITAL" }).success).toBe(true);
  });

  it("accepts optional location fields", () => {
    expect(
      facilitySchema.safeParse({ name: "CHUK", type: "HOSPITAL", province: "Kigali", district: "Nyarugenge" }).success,
    ).toBe(true);
  });

  it("rejects a missing name", () => {
    expect(facilitySchema.safeParse({ name: "", type: "HOSPITAL" }).success).toBe(false);
  });

  it("rejects a missing type", () => {
    expect(facilitySchema.safeParse({ name: "CHUK", type: "" }).success).toBe(false);
  });
});
