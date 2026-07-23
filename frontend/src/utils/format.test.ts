import { describe, it, expect } from "vitest";
import { formatDate, formatDateTime, formatFormDateValue, timeAgo } from "./format";

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

describe("formatFormDateValue", () => {
  it("drops the T separator from a datetime-local value", () => {
    expect(formatFormDateValue("2026-07-16T11:47", "datetime")).toBe("16 Jul 2026, 11:47");
  });

  it("keeps a date-only value on its stated day", () => {
    expect(formatFormDateValue("2026-07-16", "date")).toBe("16 Jul 2026");
  });

  it("normalises a time-only value", () => {
    expect(formatFormDateValue("09:05", "time")).toBe("09:05");
  });

  it("falls back to the raw value when unparseable", () => {
    expect(formatFormDateValue("sometime tuesday", "datetime")).toBe("sometime tuesday");
  });

  it("falls back to the raw value when a time is unparseable", () => {
    expect(formatFormDateValue("half past nine", "time")).toBe("half past nine");
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
