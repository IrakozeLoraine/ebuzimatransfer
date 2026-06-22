import * as React from "react";
import { useIsDesktop } from "@/hooks/useMediaQuery";
import * as D from "@/components/ui/dialog";
import * as S from "@/components/ui/sheet";
import { cn } from "@/utils/cn";

/**
 * A drop-in replacement for the {@link D Dialog} primitives that renders a
 * centered modal on desktop and a right-side sheet (shadcn Sheet) on mobile.
 * The exported names mirror `@/components/ui/dialog`, so a form modal can opt in
 * by changing only its import path.
 */

const ModeContext = React.createContext(true);
const useMode = () => React.useContext(ModeContext);

type RootProps = {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children?: React.ReactNode;
};

const Dialog = ({ children, ...props }: RootProps) => {
  const isDesktop = useIsDesktop();
  return (
    <ModeContext.Provider value={isDesktop}>
      {isDesktop ? (
        <D.Dialog {...props}>{children}</D.Dialog>
      ) : (
        <S.Sheet {...props}>{children}</S.Sheet>
      )}
    </ModeContext.Provider>
  );
};

const DialogContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & { children?: React.ReactNode }
>(({ className, children, ...props }, ref) => {
  const isDesktop = useMode();
  if (isDesktop) {
    return (
      <D.DialogContent ref={ref} className={className} {...props}>
        {children}
      </D.DialogContent>
    );
  }
  return (
    <S.SheetContent
      ref={ref}
      side="right"
      className="w-[90vw] max-w-md gap-0 overflow-y-auto p-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:max-w-md"
    >
      {children}
    </S.SheetContent>
  );
});
DialogContent.displayName = "ResponsiveDialogContent";

const DialogHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => {
  const isDesktop = useMode();
  return isDesktop ? (
    <D.DialogHeader className={className} {...props} />
  ) : (
    <div className={cn("grid gap-1.5 pb-3 pr-6 text-left", className)} {...props} />
  );
};
DialogHeader.displayName = "ResponsiveDialogHeader";

const DialogFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => {
  const isDesktop = useMode();
  return (
    <div
      className={cn(
        isDesktop
          ? "flex flex-col-reverse sm:flex-row sm:justify-end sm:gap-2"
          : "mt-2 flex flex-col gap-2",
        className
      )}
      {...props}
    />
  );
};
DialogFooter.displayName = "ResponsiveDialogFooter";

const DialogTitle = React.forwardRef<HTMLHeadingElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => {
    const isDesktop = useMode();
    return isDesktop ? (
      <D.DialogTitle ref={ref} className={className} {...props} />
    ) : (
      <S.SheetTitle ref={ref} className={className} {...props} />
    );
  }
);
DialogTitle.displayName = "ResponsiveDialogTitle";

const DialogDescription = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => {
    const isDesktop = useMode();
    return isDesktop ? (
      <p ref={ref} className={cn("text-sm text-muted-foreground", className)} {...props} />
    ) : (
      <S.SheetDescription ref={ref} className={className} {...props} />
    );
  }
);
DialogDescription.displayName = "ResponsiveDialogDescription";

const DialogClose = ({ children, ...props }: React.ComponentProps<typeof D.DialogClose>) => {
  const isDesktop = useMode();
  return isDesktop ? (
    <D.DialogClose {...props}>{children}</D.DialogClose>
  ) : (
    <S.SheetClose {...props}>{children}</S.SheetClose>
  );
};

const DialogTrigger = ({ children, ...props }: React.ComponentProps<typeof D.DialogTrigger>) => {
  const isDesktop = useMode();
  return isDesktop ? (
    <D.DialogTrigger {...props}>{children}</D.DialogTrigger>
  ) : (
    <S.SheetTrigger {...props}>{children}</S.SheetTrigger>
  );
};

export {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
  DialogClose,
  DialogTrigger,
};
