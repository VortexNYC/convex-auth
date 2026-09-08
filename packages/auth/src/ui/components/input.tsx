import * as React from "react";

import { cn } from "../lib/cn";

/** Compact text input. Token-driven, quiet border, clear focus ring. */
export function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      className={cn(
        "border-input text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 flex h-8 w-full rounded-md border bg-transparent px-2.5 py-1 text-sm transition-colors outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}
