import * as React from "react";

import { cn } from "./cn";

function composeRefs<T>(...refs: (React.Ref<T> | undefined)[]): React.RefCallback<T> {
  return (value) => {
    for (const ref of refs) {
      if (typeof ref === "function") {
        ref(value);
      } else if (ref != null && "current" in ref) {
        (ref as React.MutableRefObject<T | null>).current = value;
      }
    }
  };
}

function mergeProps(
  slotProps: Record<string, unknown>,
  childProps: Record<string, unknown>,
): Record<string, unknown> {
  const result: Record<string, unknown> = { ...slotProps };

  for (const [key, value] of Object.entries(childProps)) {
    if (key === "className" && result.className) {
      result.className = cn(result.className as string, value as string);
    } else if (key === "style") {
      result.style = {
        ...(result.style as React.CSSProperties),
        ...(value as React.CSSProperties),
      };
    } else if (
      key.startsWith("on") &&
      typeof value === "function" &&
      typeof result[key] === "function"
    ) {
      const existing = result[key] as (...args: unknown[]) => void;
      result[key] = (...args: unknown[]) => {
        existing(...args);
        value(...args);
      };
    } else if (result[key] === undefined) {
      result[key] = value;
    }
  }

  return result;
}

export type SlotProps = React.HTMLAttributes<HTMLElement> & {
  children?: React.ReactNode;
};

export const Slot = React.forwardRef<HTMLElement, SlotProps>(function Slot(
  { children, ...props },
  forwardedRef,
) {
  if (!React.isValidElement(children)) {
    return <span {...props}>{children}</span>;
  }

  const child = children as React.ReactElement<Record<string, unknown>> & {
    ref?: React.Ref<unknown>;
  };

  return React.cloneElement(child, {
    ...mergeProps(props as Record<string, unknown>, child.props as Record<string, unknown>),
    ref: composeRefs(forwardedRef, child.ref as React.Ref<HTMLElement>),
  });
});
