import { describe, it, expect } from "vitest";
import { resourceSchema, assignResourceSchema } from "./resource.schema";

const UUID = "123e4567-e89b-12d3-a456-426614174000";

describe("resourceSchema", () => {
  it("accepts a valid resource and defaults the quantity to 1", () => {
    const result = resourceSchema.safeParse({ resource_name: "Ventilator" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.quantity).toBe(1);
  });

  it("accepts an empty-string unit id (unassigned)", () => {
    expect(resourceSchema.safeParse({ resource_name: "Ventilator", unit_id: "" }).success).toBe(true);
  });

  it("accepts a valid uuid unit id", () => {
    expect(resourceSchema.safeParse({ resource_name: "Ventilator", unit_id: UUID }).success).toBe(true);
  });

  it("rejects a non-uuid unit id", () => {
    expect(resourceSchema.safeParse({ resource_name: "Ventilator", unit_id: "abc" }).success).toBe(false);
  });

  it("rejects a too-short resource name", () => {
    expect(resourceSchema.safeParse({ resource_name: "V" }).success).toBe(false);
  });

  it("rejects a quantity below 1", () => {
    expect(resourceSchema.safeParse({ resource_name: "Ventilator", quantity: 0 }).success).toBe(false);
  });
});

describe("assignResourceSchema", () => {
  it("accepts empty strings or valid uuids", () => {
    expect(assignResourceSchema.safeParse({ facility_id: "", unit_id: UUID }).success).toBe(true);
  });

  it("rejects a non-uuid facility id", () => {
    expect(assignResourceSchema.safeParse({ facility_id: "nope" }).success).toBe(false);
  });
});
