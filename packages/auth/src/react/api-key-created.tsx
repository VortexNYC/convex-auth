import { cn } from "./lib/ui";
import { useCallback, useState } from "react";

export type ConvexApiKeyCreatedProps = {
  apiKey: string;
  classNames?: {
    card?: string;
    content?: string;
    title?: string;
    token?: string;
    hint?: string;
    button?: string;
  };
  onClose?: () => void;
};

export function ConvexApiKeyCreated({ apiKey, classNames, onClose }: ConvexApiKeyCreatedProps) {
  const [copied, setCopied] = useState(false);

  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(apiKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  }, [apiKey]);

  return (
    <div
      className={cn("border-foreground/10 bg-background/20 rounded-lg border", classNames?.card)}
    >
      <div className={cn("space-y-3 p-5", classNames?.content)}>
        <p className={cn("font-medium text-sm", classNames?.title)}>API key created</p>
        <p
          className={cn(
            "border-foreground/10 bg-foreground/5 break-all rounded border p-3 font-mono text-xs",
            classNames?.token,
          )}
        >
          {apiKey}
        </p>
        <p className={cn("text-foreground/60 text-xs", classNames?.hint)}>
          Copy it now. This is the only time the full token is shown.
        </p>
        <div className="flex gap-2">
          <button
            className={cn(
              "bg-foreground text-background hover:bg-foreground/90 h-10 rounded-md px-4 text-sm font-medium transition-colors",
              classNames?.button,
            )}
            onClick={copy}
            type="button"
          >
            {copied ? "Copied" : "Copy"}
          </button>
          {onClose && (
            <button
              className={cn(
                "border-foreground/15 text-foreground/70 hover:bg-foreground/5 h-10 rounded-md border px-4 text-sm font-medium transition-colors",
                classNames?.button,
              )}
              onClick={onClose}
              type="button"
            >
              Close
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
