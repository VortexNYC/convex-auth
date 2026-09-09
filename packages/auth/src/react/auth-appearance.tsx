import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type ConvexAuthTheme = "light" | "dark" | "system";

export type ConvexAuthAppearanceContextValue = {
  theme: ConvexAuthTheme;
  resolvedTheme: "light" | "dark";
  setTheme: (theme: ConvexAuthTheme) => void;
};

const ConvexAuthAppearanceContext = createContext<ConvexAuthAppearanceContextValue | null>(null);

function getSystemTheme(): "light" | "dark" {
  if (typeof window === "undefined") {
    return "light";
  }
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function resolveTheme(theme: ConvexAuthTheme): "light" | "dark" {
  return theme === "system" ? getSystemTheme() : theme;
}

export function useConvexAuthAppearance(): ConvexAuthAppearanceContextValue {
  const ctx = useContext(ConvexAuthAppearanceContext);
  if (ctx === null) {
    throw new Error("useConvexAuthAppearance must be used within a ConvexAuthAppearanceProvider");
  }
  return ctx;
}

export type ConvexAuthAppearanceProviderProps = {
  children: ReactNode;
  defaultTheme?: ConvexAuthTheme;
  enableSystem?: boolean;
  storageKey?: string;
};

export function ConvexAuthAppearanceProvider({
  children,
  defaultTheme = "system",
  enableSystem = true,
  storageKey = "convex-auth-theme",
}: ConvexAuthAppearanceProviderProps) {
  const [theme, setTheme] = useState<ConvexAuthTheme>(defaultTheme);
  const [resolvedTheme, setResolvedTheme] = useState<"light" | "dark">(() =>
    resolveTheme(defaultTheme),
  );

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    try {
      const stored = window.localStorage.getItem(storageKey);
      if (stored === "light" || stored === "dark" || stored === "system") {
        setTheme(stored);
      }
    } catch {
      // storage may be unavailable (e.g., private mode)
    }
  }, [defaultTheme, storageKey]);

  useEffect(() => {
    const resolved = resolveTheme(theme);
    setResolvedTheme(resolved);

    if (typeof window === "undefined") {
      return;
    }

    try {
      window.localStorage.setItem(storageKey, theme);
    } catch {
      // storage may be unavailable
    }

    if (typeof document !== "undefined") {
      document.documentElement.setAttribute("data-convex-auth-theme", resolved);
    }
  }, [theme, storageKey]);

  useEffect(() => {
    if (!enableSystem || theme !== "system" || typeof window === "undefined") {
      return;
    }
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const listener = () => setResolvedTheme(resolveTheme("system"));
    media.addEventListener("change", listener);
    return () => media.removeEventListener("change", listener);
  }, [enableSystem, theme]);

  return (
    <ConvexAuthAppearanceContext.Provider value={{ theme, resolvedTheme, setTheme }}>
      {children}
    </ConvexAuthAppearanceContext.Provider>
  );
}
