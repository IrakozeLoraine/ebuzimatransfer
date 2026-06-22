import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { useUiStore } from "@/store/ui.store";
import { SidebarNav } from "./SidebarNav";

/** Slide-in navigation drawer for mobile (< md), toggled from the header. */
export const MobileSidebar = () => {
  const open = useUiStore((s) => s.mobileNavOpen);
  const setOpen = useUiStore((s) => s.setMobileNavOpen);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent side="left" className="w-72 max-w-[85vw] p-0 md:hidden">
        <SheetTitle className="sr-only">Navigation menu</SheetTitle>
        <SidebarNav onNavigate={() => setOpen(false)} />
      </SheetContent>
    </Sheet>
  );
};
