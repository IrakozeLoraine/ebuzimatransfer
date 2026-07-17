import { describe, it, expect, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useWorkContext } from "./useWorkContext";
import { useAuthStore } from "@/store/auth.store";
import type { UserMe } from "@/types/auth";

const baseUser = (overrides: Partial<UserMe> = {}): UserMe => ({
  id: "u1",
  email: "a@b.rw",
  medical_id: "MD1",
  first_name: "Ada",
  last_name: "Uwase",
  phone: null,
  location: null,
  unit_ids: [],
  active_unit_id: null,
  roles: ["CLINICIAN"],
  active_facility_id: null,
  facilities: [],
  facility_roles: [],
  account_status: "ACTIVE",
  ...overrides,
});

const F1 = { id: "f1", name: "CHUK" };
const F2 = { id: "f2", name: "CHUB" };
const ICU = { id: "u-icu", name: "ICU" };
const HDU = { id: "u-hdu", name: "HDU" };

const setUser = (u: UserMe | null) => useAuthStore.setState({ user: u });

describe("useWorkContext", () => {
  beforeEach(() => setUser(null));

  it("is unambiguous for a single facility with a single unit", () => {
    setUser(
      baseUser({
        active_facility_id: "f1",
        active_unit_id: "u-icu",
        facilities: [F1],
        facility_roles: [{ facility: F1, roles: ["CLINICIAN"], units: [ICU] }],
      }),
    );
    const { result } = renderHook(() => useWorkContext());
    expect(result.current.needsSelection).toBe(false);
    expect(result.current.activeUnit?.name).toBe("ICU");
  });

  it("needs selection when the user belongs to more than one facility", () => {
    setUser(
      baseUser({
        active_facility_id: "f1",
        facilities: [F1, F2],
        facility_roles: [
          { facility: F1, roles: ["CLINICIAN"], units: [ICU] },
          { facility: F2, roles: ["CLINICIAN"], units: [ICU] },
        ],
      }),
    );
    const { result } = renderHook(() => useWorkContext());
    expect(result.current.needsSelection).toBe(true);
  });

  it("needs selection when the active facility exposes more than one unit", () => {
    setUser(
      baseUser({
        active_facility_id: "f1",
        facilities: [F1],
        facility_roles: [{ facility: F1, roles: ["CLINICIAN"], units: [ICU, HDU] }],
      }),
    );
    const { result } = renderHook(() => useWorkContext());
    expect(result.current.needsSelection).toBe(true);
    expect(result.current.unitsForActiveFacility).toHaveLength(2);
  });

  it("exposes the units for an arbitrary facility", () => {
    setUser(
      baseUser({
        active_facility_id: "f1",
        facilities: [F1, F2],
        facility_roles: [
          { facility: F1, roles: ["CLINICIAN"], units: [ICU] },
          { facility: F2, roles: ["CLINICIAN"], units: [ICU, HDU] },
        ],
      }),
    );
    const { result } = renderHook(() => useWorkContext());
    expect(result.current.unitsForFacility("f2")).toHaveLength(2);
    expect(result.current.unitsForFacility(null)).toEqual([]);
  });
});
