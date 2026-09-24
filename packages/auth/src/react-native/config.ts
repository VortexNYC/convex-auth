export type ExpoPlatformOS = "android" | "ios" | "web" | "macos" | "windows" | "native";

export type ExpoResolvedAuthConfig = {
  convexSiteUrl: string;
  convexUrl: string;
  platformOS: ExpoPlatformOS;
  scheme: string;
};

export type ExpoAuthClientMode =
  | {
      kind: "native";
      scheme: string;
      storagePrefix: string;
    }
  | {
      kind: "web";
      scheme: string;
      storagePrefix: string;
    };

export function resolveExpoAuthConfig(args: {
  convexSiteUrl?: string | null;
  convexUrl?: string | null;
  platformOS: ExpoPlatformOS;
  scheme?: string | readonly string[] | null;
}): ExpoResolvedAuthConfig {
  const convexUrl = requireExpoNonEmpty("EXPO_PUBLIC_CONVEX_URL", args.convexUrl);

  return {
    convexSiteUrl:
      normalizeOptionalExpoString(args.convexSiteUrl) ?? deriveExpoConvexSiteUrl(convexUrl),
    convexUrl,
    platformOS: args.platformOS,
    scheme: resolveExpoScheme(args.scheme),
  };
}

export function deriveExpoConvexSiteUrl(convexUrl: string): string {
  const normalized = requireExpoNonEmpty("EXPO_PUBLIC_CONVEX_URL", convexUrl);
  if (normalized.endsWith(".convex.cloud")) {
    return normalized.replace(".convex.cloud", ".convex.site");
  }
  return normalized;
}

export function resolveExpoScheme(scheme: string | readonly string[] | null | undefined): string {
  const resolved = Array.isArray(scheme) ? scheme[0] : scheme;
  return normalizeExpoScheme(requireExpoNonEmpty("Expo scheme", resolved));
}

export function resolveExpoAuthClientMode(args: {
  platformOS?: ExpoPlatformOS;
  scheme: string;
  storagePrefix?: string;
}): ExpoAuthClientMode {
  const scheme = normalizeExpoScheme(args.scheme);
  const storagePrefix = normalizeExpoStoragePrefix(args.storagePrefix ?? scheme);

  return {
    kind: args.platformOS === "web" ? "web" : "native",
    scheme,
    storagePrefix,
  };
}

export function normalizeExpoTrustedOrigin(scheme: string): string {
  return `${normalizeExpoScheme(scheme)}://`;
}

export function buildExpoTrustedOrigins(args: {
  includeExpoDevelopmentOrigins?: boolean;
  scheme: string;
  siteUrl?: string | null;
}): string[] {
  const origins = [normalizeExpoTrustedOrigin(args.scheme)];
  const siteUrl = args.siteUrl?.trim();
  if (siteUrl) {
    origins.push(siteUrl);
  }

  if (args.includeExpoDevelopmentOrigins === true) {
    origins.push("exp://", "exp://**", "exp://192.168.*.*:*/**");
  }

  return Array.from(new Set(origins));
}

function normalizeExpoScheme(scheme: string): string {
  const normalized = scheme.trim().replace(/:\/\/.*$/, "");
  if (!normalized) {
    throw new Error("Expo auth scheme is required.");
  }
  if (!/^[a-z][a-z0-9+.-]*$/i.test(normalized)) {
    throw new Error(`Invalid Expo auth scheme: ${scheme}`);
  }
  return normalized;
}

function normalizeExpoStoragePrefix(storagePrefix: string): string {
  const normalized = storagePrefix.trim();
  if (!normalized) {
    throw new Error("Expo auth storagePrefix is required.");
  }
  return normalized;
}

function normalizeOptionalExpoString(value: string | null | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized && normalized.length > 0 ? normalized : undefined;
}

function requireExpoNonEmpty(label: string, value: string | null | undefined): string {
  const normalized = normalizeOptionalExpoString(value);
  if (normalized === undefined) {
    throw new Error(`${label} is required for Convex Auth Expo setup.`);
  }
  return normalized;
}
