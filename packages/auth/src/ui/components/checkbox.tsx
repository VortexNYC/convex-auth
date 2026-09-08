import { Check } from "lucide-react";
import { Checkbox as CheckboxPrimitive } from "@base-ui/react/checkbox";
import * as React from "react";

import { cn } from "../lib/cn";

function checkboxState(checked: boolean, indeterminate: boolean) {
  if (indeterminate) return "indeterminate";
  return checked ? "checked" : "unchecked";
}

/** Compact checkbox (row selection, forms). Token-driven, clear focus ring. */
export function Checkbox({
  className,
  ...props
}: React.ComponentProps<typeof CheckboxPrimitive.Root>) {
  return (
    <CheckboxPrimitive.Root
      className={cn(
        "border-input focus-visible:ring-ring/50 data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground data-[state=indeterminate]:border-primary data-[state=indeterminate]:bg-primary data-[state=indeterminate]:text-primary-foreground size-4 shrink-0 rounded border transition-colors outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      render={(htmlProps, state) => (
        <span data-state={checkboxState(state.checked, state.indeterminate)} {...htmlProps} />
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator
        className="flex items-center justify-center"
        render={(htmlProps, state) => (
          <span data-state={checkboxState(state.checked, state.indeterminate)} {...htmlProps} />
        )}
      >
        <Check className="size-3" />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}
