import { format, formatDistanceToNow } from "date-fns";

export const formatDate = (iso: string) =>
  format(new Date(iso), "dd MMM yyyy");

export const formatDateTime = (iso: string) =>
  format(new Date(iso), "dd MMM yyyy HH:mm");

export const timeAgo = (iso: string) =>
  formatDistanceToNow(new Date(iso), { addSuffix: true });

export const REFERRAL_STATUS_LABELS: Record<string, string> = {
  REQUESTED: "Requested",
  UNDER_REVIEW: "Under Review",
  ACCEPTED: "Accepted",
  TRANSPORT_ARRANGED: "Transport Arranged",
  EN_ROUTE: "En Route",
  ARRIVED: "Arrived",
  REJECTED: "Rejected",
  CANCELLED: "Cancelled",
};

export const URGENCY_LABELS: Record<string, string> = {
  IMMEDIATE: "Immediate",
  URGENT: "Urgent",
  NON_URGENT: "Non-Urgent",
};
