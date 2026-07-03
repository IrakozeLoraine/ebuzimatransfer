import { describe, it, expect } from "vitest";
import { formatDate, formatDateTime, timeAgo } from "./format";

describe("formatDate", () => {
  it("formats an ISO date as 'dd MMM yyyy'", () => {
    expect(formatDate("2026-07-03T14:30:00Z")).toMatch(
      /^0[23] Jul 2026$/ // allow for local-timezone day boundary
    );
  });
});

describe("formatDateTime", () => {
  it("includes the time component", () => {
    const out = formatDateTime("2026-07-03T14:30:00");
    expect(out).toContain("Jul 2026");
    expect(out).toMatch(/\d{2}:\d{2}$/);
  });
});

describe("timeAgo", () => {
  it("renders a relative, suffixed distance", () => {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    expect(timeAgo(oneHourAgo)).toMatch(/about 1 hour ago/);
  });

  it("uses a future suffix for upcoming dates", () => {
    const inTwoDays = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString();
    expect(timeAgo(inTwoDays)).toMatch(/in \d/);
  });
});
