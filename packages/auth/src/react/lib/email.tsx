import { renderToStaticMarkup } from "react-dom/server";
import type { AnchorHTMLAttributes, HTMLAttributes, ReactNode } from "react";

export type EmailProps = {
  children?: ReactNode;
  muted?: boolean;
};

type ButtonProps = AnchorHTMLAttributes<HTMLAnchorElement>;

export function Button(props: ButtonProps) {
  return (
    <a
      {...props}
      style={{
        display: "inline-block",
        padding: "12px 24px",
        backgroundColor: "#111",
        color: "#fff",
        borderRadius: "6px",
        textDecoration: "none",
      }}
    >
      {props.children}
    </a>
  );
}

export function EmailHeading(props: HTMLAttributes<HTMLHeadingElement>) {
  return <h1 {...props} style={{ margin: "0 0 16px" }} />;
}

export function EmailLayout(props: { preview?: string; children: ReactNode }) {
  return (
    <html>
      <head>{props.preview ? <title>{props.preview}</title> : null}</head>
      <body style={{ fontFamily: "sans-serif", padding: 24 }}>{props.children}</body>
    </html>
  );
}

export function EmailStrong(props: HTMLAttributes<HTMLElement>) {
  return <strong {...props} />;
}

export function EmailText(props: EmailProps) {
  const { muted, ...rest } = props;
  return <p {...rest} style={{ margin: "0 0 12px", color: muted ? "#666" : undefined }} />;
}

export function renderEmail(element: ReactNode): string {
  return `<!doctype html>${renderToStaticMarkup(<>{element}</>)}`;
}

export function renderEmailText(element: ReactNode): string {
  const html = renderToStaticMarkup(<>{element}</>);
  const text = html
    .replace(/<head[\s\S]*?<\/head>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|h[1-6]|li)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n\s*\n/g, "\n")
    .trim();
  return text;
}
