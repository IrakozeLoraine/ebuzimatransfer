import { cn } from "@/utils/cn";

interface Props {
  label: string;
  value: number | string;
  className?: string;
  onClick?: () => void;
}

export const StatCard = ({
  label,
  value,
  className,
  onClick,
}: Props) => {

  const Component = onClick ? "button" : "div";

  return (
    <Component
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={cn(
        "rounded-xl border bg-card p-5 shadow-card transition-all duration-200 hover:shadow-card-hover hover:-translate-y-px",
        onClick && "w-full cursor-pointer text-left",
        className
      )}
    >
      <div className="flex flex-col md:flex-row items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
          <p className="mt-2 text-3xl font-bold tracking-tight text-foreground">{value}</p>
        </div>
      </div>
    </Component>
  );
};
