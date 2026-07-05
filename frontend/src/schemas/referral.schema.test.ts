import { describe, it, expect } from "vitest";
import { newReferralSchema, rejectReferralSchema } from "./referral.schema";

const validReferral = {
  sex: "F",
  diagnosis: "Severe sepsis",
  reason_for_transfer: "Requires ICU care",
  form_type: "ICU_TRANSFER",
  preferred_facility_id: "fac-1",
  requested_unit_id: "unit-1",
  requested_resource_ids: ["res-1"],
};

describe("newReferralSchema", () => {
  it("accepts a complete valid referral", () => {
    expect(newReferralSchema.safeParse(validReferral).success).toBe(true);
  });

  it("treats dictation fields as optional", () => {
    const result = newReferralSchema.safeParse({
      ...validReferral,
      transcript: "spoken notes",
      ai_summary: "summary",
    });
    expect(result.success).toBe(true);
  });

  it.each([
    "sex",
    "diagnosis",
    "reason_for_transfer",
    "preferred_facility_id",
    "requested_unit_id",
    "requested_resource_ids",
  ])("rejects when required field %s is missing", (field) => {
    const payload = { ...validReferral } as Record<string, unknown>;
    delete payload[field];
    expect(newReferralSchema.safeParse(payload).success).toBe(false);
  });

  it("rejects an empty resource list", () => {
    const result = newReferralSchema.safeParse({
      ...validReferral,
      requested_resource_ids: [],
    });
    expect(result.success).toBe(false);
  });

  it("rejects an empty destination facility", () => {
    const result = newReferralSchema.safeParse({
      ...validReferral,
      preferred_facility_id: "",
    });
    expect(result.success).toBe(false);
  });
});

describe("rejectReferralSchema", () => {
  it("requires a reason", () => {
    expect(rejectReferralSchema.safeParse({ reason: "No beds" }).success).toBe(true);
    expect(rejectReferralSchema.safeParse({ reason: "" }).success).toBe(false);
  });

  it("allows an optional comment", () => {
    const result = rejectReferralSchema.safeParse({
      reason: "No beds",
      comment: "Try again tomorrow",
    });
    expect(result.success).toBe(true);
  });
});
