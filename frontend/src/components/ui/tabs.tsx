import { cn } from "@/utils/cn";

export interface TabItem {
  value: string;
  label: string;
  icon?: React.ReactNode;
}

interface TabsProps {
  tabs: TabItem[];
  value: string;
  onValueChange: (value: string) => void;
  className?: string;
}

/** Lightweight underline-style tab bar (controlled). */
export const Tabs = ({ tabs, value, onValueChange, className }: TabsProps) => (
  <div className={cn("border-b border-border", className)}>
    <nav className="-mb-px flex gap-6" aria-label="Tabs">
      {tabs.map((tab) => {
        const active = tab.value === value;
        return (
          <button
            key={tab.value}
            type="button"
            onClick={() => onValueChange(tab.value)}
            className={cn(
              "flex items-center gap-2 border-b-2 px-1 py-3 text-sm font-medium transition-colors outline-none",
              active
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:border-border hover:text-foreground"
            )}
          >
            {tab.icon}
            {tab.label}
          </button>
        );
      })}
    </nav>
  </div>
);
