import { cn } from "@/utils/cn";
import { SidebarNav } from "./SidebarNav";

/** Fixed sidebar for desktop (>= md). On mobile the nav lives in MobileSidebar. */
export const Sidebar = () => (
  <aside
    className={cn(
      "fixed inset-y-0 left-0 z-20 hidden w-64 flex-col border-r border-border/60 md:flex",
      "bg-white/85 dark:bg-card/85 backdrop-blur-xl"
    )}
  >
    <SidebarNav />
  </aside>
);
