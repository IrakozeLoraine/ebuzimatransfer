import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { StatusBadge } from "./StatusBadge";
import type { ReferralStatus } from "@/types/referral";

describe("StatusBadge", () => {
  it("renders the human-readable label for a known status", () => {
    render(<StatusBadge status="EN_ROUTE" />);
    expect(screen.getByText("En Route")).toBeInTheDocument();
  });

  it("applies the status-specific styling", () => {
    render(<StatusBadge status="REJECTED" />);
    const badge = screen.getByText("Rejected");
    // The rose palette is used for rejected referrals.
    expect(badge.className).toContain("text-rose-700");
  });

  it("falls back to the raw status for an unknown value", () => {
    render(<StatusBadge status={"MYSTERY" as ReferralStatus} />);
    expect(screen.getByText("MYSTERY")).toBeInTheDocument();
  });

  it("merges a custom className", () => {
    render(<StatusBadge status="ACCEPTED" className="custom-marker" />);
    expect(screen.getByText("Accepted").className).toContain("custom-marker");
  });
});
