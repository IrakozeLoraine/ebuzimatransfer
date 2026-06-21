import { cn } from "@/utils/cn";
import type { ReferralStatus } from "@/types/referral";
import { REFERRAL_STATUS_LABELS } from "@/pages/referrals/constants";

const STATUS_STYLES: Record<ReferralStatus, { badge: string; dot: string; pulse: boolean }> = {
  REQUESTED:          { badge: "bg-blue-50 text-blue-700 ring-1 ring-blue-200",     dot: "bg-blue-500",    pulse: true },
  UNDER_REVIEW:       { badge: "bg-amber-50 text-amber-700 ring-1 ring-amber-200",  dot: "bg-amber-500",   pulse: true },
  ACCEPTED:           { badge: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200", dot: "bg-emerald-500", pulse: false },
  TRANSPORT_ARRANGED: { badge: "bg-violet-50 text-violet-700 ring-1 ring-violet-200", dot: "bg-violet-500", pulse: false },
  EN_ROUTE:           { badge: "bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200", dot: "bg-indigo-500", pulse: true },
  ARRIVED:            { badge: "bg-teal-50 text-teal-700 ring-1 ring-teal-200",     dot: "bg-teal-500",    pulse: false },
  REJECTED:           { badge: "bg-rose-50 text-rose-700 ring-1 ring-rose-200",     dot: "bg-rose-500",    pulse: false },
  CANCELLED:          { badge: "bg-gray-100 text-gray-500 ring-1 ring-gray-200",    dot: "bg-gray-400",    pulse: false },
};

interface Props {
  status: ReferralStatus;
  className?: string;
}

export const StatusBadge = ({ status, className }: Props) => {
  const { badge, dot, pulse } = STATUS_STYLES[status] ?? {
    badge: "bg-gray-100 text-gray-600 ring-1 ring-gray-200",
    dot: "bg-gray-400",
    pulse: false,
  };

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium",
        badge,
        className
      )}
    >
      <span className="relative flex h-1.5 w-1.5 shrink-0">
        {pulse && (
          <span
            className={cn("absolute inline-flex h-full w-full animate-ping rounded-full opacity-70", dot)}
          />
        )}
        <span className={cn("relative inline-flex h-1.5 w-1.5 rounded-full", dot)} />
      </span>
      {REFERRAL_STATUS_LABELS[status] ?? status}
    </span>
  );
};
