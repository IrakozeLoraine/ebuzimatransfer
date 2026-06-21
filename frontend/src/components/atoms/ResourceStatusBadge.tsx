import { Resource } from "@/types/resource";
import { cn } from "@/utils/cn";

const STYLES: Record<Resource["status"], { badge: string; dot: string; pulse: boolean }> = {
  AVAILABLE:      { badge: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200", dot: "bg-emerald-500", pulse: true },
  RESERVED:       { badge: "bg-amber-50 text-amber-700 ring-1 ring-amber-200",       dot: "bg-amber-500",   pulse: false },
  OCCUPIED:       { badge: "bg-rose-50 text-rose-700 ring-1 ring-rose-200",          dot: "bg-rose-500",    pulse: false },
  OUT_OF_SERVICE: { badge: "bg-gray-100 text-gray-500 ring-1 ring-gray-200",         dot: "bg-gray-400",    pulse: false },
};

const LABELS: Record<Resource["status"], string> = {
  AVAILABLE: "Available",
  RESERVED: "Reserved",
  OCCUPIED: "Occupied",
  OUT_OF_SERVICE: "Out of Service",
};

interface Props {
  status: Resource["status"];
  className?: string;
}

export const ResourceStatusBadge = ({ status, className }: Props) => {
  const { badge, dot, pulse } = STYLES[status];

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
          <span className={cn("absolute inline-flex h-full w-full animate-ping rounded-full opacity-70", dot)} />
        )}
        <span className={cn("relative inline-flex h-1.5 w-1.5 rounded-full", dot)} />
      </span>
      {LABELS[status]}
    </span>
  );
};
