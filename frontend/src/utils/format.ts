import { format, formatDistanceToNow, isValid, parseISO } from "date-fns";

export const formatDate = (iso: string) =>
  format(new Date(iso), "dd MMM yyyy");

export const formatDateTime = (iso: string) =>
  format(new Date(iso), "dd MMM yyyy HH:mm");

/** Formats the naive date/time strings produced by the form inputs
 *  ("2026-07-16", "2026-07-16T11:47", "11:47"). Falls back to the raw
 *  value when it isn't parseable so stored free text still shows. */
export const formatFormDateValue = (value: string, type: "date" | "time" | "datetime") => {
  if (type === "time") {
    const parsed = parseISO(`1970-01-01T${value}`);
    return isValid(parsed) ? format(parsed, "HH:mm") : value;
  }
  const parsed = parseISO(value);
  if (!isValid(parsed)) return value;
  return format(parsed, type === "date" ? "dd MMM yyyy" : "dd MMM yyyy, HH:mm");
};

export const timeAgo = (iso: string) =>
  formatDistanceToNow(new Date(iso), { addSuffix: true });
