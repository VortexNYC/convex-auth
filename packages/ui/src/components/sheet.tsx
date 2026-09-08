import { X } from "lucide-react";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import * as React from "react";

import { cn } from "../lib/cn";

/** Side sheet built on Base UI Dialog. Keeps list context behind a dimmed overlay
 * instead of a hard modal. */
export const Sheet = DialogPrimitive.Root;
export const SheetTrigger = DialogPrimitive.Trigger;
export const SheetClose = DialogPrimitive.Close;

const SIDE: Record<"top" | "right" | "bottom" | "left", string> = {
  top: "inset-x-0 top-0 w-full border-b data-[state=closed]:-translate-y-full data-[state=open]:translate-y-0",
  right:
    "inset-y-0 right-0 h-full w-full max-w-md border-l data-[state=closed]:translate-x-full data-[state=open]:translate-x-0",
  bottom:
    "inset-x-0 bottom-0 w-full border-t data-[state=closed]:translate-y-full data-[state=open]:translate-y-0",
  left: "inset-y-0 left-0 h-full w-full max-w-md border-r data-[state=closed]:-translate-x-full data-[state=open]:translate-x-0",
};

export type SheetContentProps = React.ComponentProps<typeof DialogPrimitive.Popup> & {
  side?: "top" | "right" | "bottom" | "left";
};

export function SheetContent({ side = "right", className, children, ...props }: SheetContentProps) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Backdrop
        className="data-[state=closed]:animate-out data-[state=open]:animate-in data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-50 bg-black/40"
        render={(htmlProps, state) => (
          <div data-state={state.open ? "open" : "closed"} {...htmlProps} />
        )}
      />
      <DialogPrimitive.Popup
        className={cn(
          "bg-background border-border fixed z-50 flex flex-col gap-0 shadow-lg transition-transform duration-200 ease-out outline-none",
          SIDE[side],
          className,
        )}
        render={(htmlProps, state) => (
          <div data-state={state.open ? "open" : "closed"} {...htmlProps} />
        )}
        {...props}
      >
        {children}
        <DialogPrimitive.Close className="text-muted-foreground focus-visible:ring-ring/50 absolute top-3 right-3 rounded-sm opacity-70 transition-opacity outline-none hover:opacity-100 focus-visible:ring-2">
          <X className="size-4" />
          <span className="sr-only">Close</span>
        </DialogPrimitive.Close>
      </DialogPrimitive.Popup>
    </DialogPrimitive.Portal>
  );
}

export function SheetHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("border-border flex flex-col gap-1 border-b px-4 py-3", className)}
      {...props}
    />
  );
}

export function SheetTitle({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title className={cn("text-foreground text-sm font-medium", className)} {...props} />
  );
}

export function SheetDescription({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description className={cn("text-muted-foreground text-xs", className)} {...props} />
  );
}

export function SheetBody({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("flex-1 overflow-y-auto px-4 py-3", className)} {...props} />;
}

export function SheetFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "border-border flex items-center justify-end gap-2 border-t px-4 py-3",
        className,
      )}
      {...props}
    />
  );
}
