import { create } from "zustand";
import * as ToastPrimitive from "@radix-ui/react-toast";
import { X, CheckCircle2, AlertCircle, Info, AlertTriangle } from "lucide-react";
import { cn } from "@/utils/cn";

type ToastVariant = "default" | "success" | "warning" | "destructive";

interface ToastItem {
  id: string;
  title?: string;
  description?: string;
  variant?: ToastVariant;
  duration?: number;
}

interface ToastStore {
  toasts: ToastItem[];
  add: (t: Omit<ToastItem, "id">) => void;
  remove: (id: string) => void;
}

const useToastStore = create<ToastStore>((set) => ({
  toasts: [],
  add: (t) =>
    set((s) => ({
      toasts: [...s.toasts, { ...t, id: Math.random().toString(36).slice(2) }],
    })),
  remove: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

// `toast` is the imperative entry point used across the app; it lives with the
// Toaster component it drives. The co-located non-component export only disables Fast
// Refresh for this leaf file.
// eslint-disable-next-line react-refresh/only-export-components
export const toast = (options: Omit<ToastItem, "id">) =>
  useToastStore.getState().add(options);

const VARIANT_STYLES: Record<ToastVariant, string> = {
  default: "border-border",
  success: "border-l-4 border-l-emerald-500 border-border",
  warning: "border-l-4 border-l-amber-500 border-border",
  destructive: "border-l-4 border-l-red-500 border-border",
};

const VARIANT_ICONS: Record<ToastVariant, React.ReactNode> = {
  default: <Info className="h-4 w-4 text-primary" />,
  success: <CheckCircle2 className="h-4 w-4 text-emerald-500" />,
  warning: <AlertTriangle className="h-4 w-4 text-amber-500" />,
  destructive: <AlertCircle className="h-4 w-4 text-red-500" />,
};

export const Toaster = () => {
  const { toasts, remove } = useToastStore();

  return (
    <ToastPrimitive.Provider swipeDirection="right">
      {toasts.map((t) => (
        <ToastPrimitive.Root
          key={t.id}
          duration={t.duration ?? 4500}
          onOpenChange={(open) => !open && remove(t.id)}
          className={cn(
            "group pointer-events-auto relative flex items-start gap-3 overflow-hidden rounded-xl p-4 pr-8",
            "bg-white/90 dark:bg-card/90 backdrop-blur-xl",
            "shadow-card border",
            "data-[state=open]:animate-slide-up data-[state=closed]:animate-fade-in",
            "data-[swipe=move]:translate-x-[var(--radix-toast-swipe-move-x)]",
            "data-[swipe=cancel]:translate-x-0 data-[swipe=cancel]:transition-transform",
            "data-[swipe=end]:animate-out data-[swipe=end]:slide-out-to-right-full",
            VARIANT_STYLES[t.variant ?? "default"]
          )}
        >
          <div className="mt-0.5 shrink-0">{VARIANT_ICONS[t.variant ?? "default"]}</div>
          <div className="flex-1 space-y-0.5">
            {t.title && (
              <ToastPrimitive.Title className="text-sm font-semibold text-foreground">
                {t.title}
              </ToastPrimitive.Title>
            )}
            {t.description && (
              <ToastPrimitive.Description className="text-xs text-muted-foreground">
                {t.description}
              </ToastPrimitive.Description>
            )}
          </div>
          <ToastPrimitive.Close
            className="absolute right-2 top-2 rounded-md p-1 text-muted-foreground/50 opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100"
            aria-label="Close"
          >
            <X className="h-3.5 w-3.5" />
          </ToastPrimitive.Close>
        </ToastPrimitive.Root>
      ))}
      <ToastPrimitive.Viewport className="fixed bottom-4 right-4 z-[100] flex max-h-screen w-full max-w-sm flex-col gap-2 outline-none" />
    </ToastPrimitive.Provider>
  );
};
