import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Separator,
  cn,
} from "./lib/ui";
import type {
  ButtonHTMLAttributes,
  HTMLAttributes,
  InputHTMLAttributes,
  LabelHTMLAttributes,
  ReactNode,
} from "react";

import { useAuthRuntimeStatus } from "./useAuthRuntimeStatus";

export type AuthScreenClassNames = {
  screen?: string;
  inner?: string;
  header?: string;
  title?: string;
  description?: string;
  footer?: string;
};

export function AuthScreen(props: {
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
  classNames?: AuthScreenClassNames;
}) {
  return (
    <section
      className={cn(
        "bg-background text-foreground flex min-h-screen items-center justify-center px-4 py-10",
        props.className,
        props.classNames?.screen,
      )}
    >
      <div className={cn("w-full max-w-md space-y-6", props.classNames?.inner)}>
        <div className={cn("space-y-2 text-center", props.classNames?.header)}>
          <h1 className={cn("text-3xl font-semibold tracking-tight", props.classNames?.title)}>
            {props.title}
          </h1>
          {props.description ? (
            <p className={cn("text-muted-foreground text-sm", props.classNames?.description)}>
              {props.description}
            </p>
          ) : null}
        </div>
        {props.children}
        {props.footer ? (
          <div
            className={cn("text-muted-foreground text-center text-sm", props.classNames?.footer)}
          >
            {props.footer}
          </div>
        ) : null}
      </div>
    </section>
  );
}

export function AuthCard(props: { children: ReactNode; className?: string }) {
  return (
    <Card
      className={cn(
        "border-foreground/10 bg-foreground/5 rounded-2xl px-6 py-6 shadow-2xl backdrop-blur",
        props.className,
      )}
    >
      {props.children}
    </Card>
  );
}

export type AuthCardHeaderClassNames = {
  header?: string;
  title?: string;
  description?: string;
};

export function AuthCardHeader(props: {
  title: string;
  description?: string;
  children?: ReactNode;
  classNames?: AuthCardHeaderClassNames;
}) {
  return (
    <CardHeader className={cn("space-y-1.5 p-0", props.classNames?.header)}>
      <CardTitle className={cn("text-xl font-medium tracking-tight", props.classNames?.title)}>
        {props.title}
      </CardTitle>
      {props.description ? (
        <CardDescription
          className={cn("text-muted-foreground text-sm", props.classNames?.description)}
        >
          {props.description}
        </CardDescription>
      ) : null}
      {props.children}
    </CardHeader>
  );
}

export function AuthCardContent(props: { children: ReactNode; className?: string }) {
  return (
    <CardContent className={cn("mt-5 space-y-4 p-0", props.className)}>
      {props.children}
    </CardContent>
  );
}

export function AuthField(props: HTMLAttributes<HTMLDivElement>) {
  return <div {...props} className={cn("space-y-2", props.className)} />;
}

export function AuthLabel(props: LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <Label {...props} className={cn("text-foreground text-sm font-medium", props.className)} />
  );
}

export function AuthInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <Input
      {...props}
      className={cn(
        "border-foreground/10 bg-background/30 text-foreground flex h-10 w-full rounded-xl border px-3 py-2 text-sm transition outline-none",
        "placeholder:text-muted-foreground focus:border-foreground/25 focus:ring-foreground/10 focus:ring-2 disabled:cursor-not-allowed disabled:opacity-50",
        props.className,
      )}
    />
  );
}

export function AuthButton(
  props: ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: "primary" | "secondary" | "ghost";
  },
) {
  const variant = props.variant ?? "primary";

  return (
    <Button
      {...props}
      variant={variant === "primary" ? "default" : variant}
      className={cn(
        "inline-flex h-10 w-full items-center justify-center rounded-xl px-4 text-sm font-medium transition outline-none",
        "focus:ring-foreground/10 focus:ring-2 disabled:cursor-not-allowed disabled:opacity-50",
        variant === "primary" && "bg-foreground text-background hover:bg-foreground/90",
        variant === "secondary" &&
          "border-foreground/10 bg-foreground/5 text-foreground hover:bg-foreground/10 border",
        variant === "ghost" && "text-muted-foreground hover:bg-foreground/5",
        props.className,
      )}
    />
  );
}

export function AuthAlert(props: {
  tone?: "default" | "error" | "success" | "warning";
  title?: string;
  children: ReactNode;
  className?: string;
}) {
  const tone = props.tone ?? "default";

  return (
    <div
      className={cn(
        "rounded-xl border px-3 py-3 text-sm",
        tone === "default" && "border-foreground/10 bg-foreground/5 text-muted-foreground",
        tone === "error" && "border-destructive/30 bg-destructive/10 text-destructive",
        tone === "success" && "border-success/30 bg-success/10 text-success",
        tone === "warning" && "border-warning/30 bg-warning/10 text-warning",
        props.className,
      )}
    >
      {props.title ? <div className="mb-1 font-medium">{props.title}</div> : null}
      <div>{props.children}</div>
    </div>
  );
}

export function AuthDivider(props: { label?: string; className?: string }) {
  return (
    <div
      className={cn(
        "text-muted-foreground flex items-center gap-3 text-xs tracking-[0.2em] uppercase",
        props.className,
      )}
    >
      <Separator className="bg-foreground/10 flex-1" />
      {props.label ? <span>{props.label}</span> : null}
      <Separator className="bg-foreground/10 flex-1" />
    </div>
  );
}

export function AuthProviderButton(
  props: ButtonHTMLAttributes<HTMLButtonElement> & { providerLabel: string },
) {
  const { providerLabel, ...buttonProps } = props;
  return (
    <AuthButton {...buttonProps} variant="secondary">
      Continue with {providerLabel}
    </AuthButton>
  );
}

export function AuthRuntimeStatusBadge(props: { className?: string }) {
  const status = useAuthRuntimeStatus();
  const tone =
    status.state === "convexReady"
      ? "bg-success/15 text-success border-success/30"
      : status.reauthRequired
        ? "bg-destructive/15 text-destructive border-destructive/30"
        : "bg-foreground/5 text-muted-foreground border-foreground/10";

  return (
    <Badge
      variant={
        status.state === "convexReady"
          ? "success"
          : status.reauthRequired
            ? "destructive"
            : "outline"
      }
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-1 text-xs",
        tone,
        props.className,
      )}
    >
      {status.state}
    </Badge>
  );
}

export function AuthRuntimeSummary(props: { className?: string }) {
  const status = useAuthRuntimeStatus();

  return (
    <AuthAlert className={props.className} title="Runtime status">
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
        <RuntimeRow label="state" value={status.state} />
        <RuntimeRow label="provider" value={String(status.providerAuthenticated)} />
        <RuntimeRow label="token" value={String(status.tokenAvailable)} />
        <RuntimeRow label="convex" value={String(status.convexAuthenticated)} />
        <RuntimeRow label="recovering" value={String(status.isRecovering)} />
        <RuntimeRow label="reauth" value={String(status.reauthRequired)} />
      </dl>
    </AuthAlert>
  );
}

function RuntimeRow(props: { label: string; value: string }) {
  return (
    <>
      <dt className="text-muted-foreground">{props.label}</dt>
      <dd className="text-foreground">{props.value}</dd>
    </>
  );
}
