import { cn } from "@/utils/cn";
import type { LucideIcon } from "lucide-react";

interface Props {
  label: string;
  value: number | string;
  icon: LucideIcon;
  accent?: "teal" | "emerald" | "amber" | "rose" | "violet" | "indigo";
  className?: string;
}

const ACCENT_STYLES = {
  teal:    { icon: "from-teal-400 to-cyan-500",    glow: "shadow-teal-200/60",    text: "text-teal-600" },
  emerald: { icon: "from-emerald-400 to-green-500", glow: "shadow-emerald-200/60", text: "text-emerald-600" },
  amber:   { icon: "from-amber-400 to-orange-500",  glow: "shadow-amber-200/60",   text: "text-amber-600" },
  rose:    { icon: "from-rose-400 to-red-500",       glow: "shadow-rose-200/60",    text: "text-rose-600" },
  violet:  { icon: "from-violet-400 to-purple-500", glow: "shadow-violet-200/60",  text: "text-violet-600" },
  indigo:  { icon: "from-indigo-400 to-blue-500",   glow: "shadow-indigo-200/60",  text: "text-indigo-600" },
};

export const StatCard = ({
  label,
  value,
  icon: Icon,
  accent = "teal",
  className,
}: Props) => {
  const styles = ACCENT_STYLES[accent];

  return (
    <div
      className={cn(
        "rounded-xl border bg-card p-5 shadow-card transition-all duration-200 hover:shadow-card-hover hover:-translate-y-px",
        className
      )}
    >
      <div className="flex flex-col md:flex-row items-start justify-between gap-2 gap-4">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
          <p className="mt-2 text-3xl font-bold tracking-tight text-foreground">{value}</p>
        </div>
        <div
          className={cn(
            "flex h-12 w-12 shrink-0 items-center justify-center rounded-xl",
            "bg-gradient-to-br shadow-md",
            styles.icon,
            styles.glow
          )}
        >
          <Icon className="h-6 w-6 text-white" />
        </div>
      </div>
    </div>
  );
};
