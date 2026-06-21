import { format, formatDistanceToNow } from "date-fns";

export const formatDate = (iso: string) =>
  format(new Date(iso), "dd MMM yyyy");

export const formatDateTime = (iso: string) =>
  format(new Date(iso), "dd MMM yyyy HH:mm");

export const timeAgo = (iso: string) =>
  formatDistanceToNow(new Date(iso), { addSuffix: true });
