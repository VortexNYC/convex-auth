import {
  clearPendingPostSignUpSync as clearPendingPostSignUpSyncStorage,
  getBrowserSessionStorage,
  markPendingPostSignUpSync as markPendingPostSignUpSyncStorage,
  type PostSignUpStorageLike,
} from "./post-sign-up";

export type ConvexAuthEventSurface =
  | "sign-in"
  | "sign-up"
  | "invite"
  | "choose-organization"
  | "runtime";

export type ConvexAuthPendingFlow = "sign-in" | "sign-up" | "choose-organization";

export type ConvexAuthPendingFlowState = {
  redirectPath?: string;
};

export type ConvexAuthStorageLike = PostSignUpStorageLike &
  Pick<Storage, "getItem" | "removeItem" | "setItem">;

export type ConvexAuthEventCapture = (
  eventName: string,
  properties: { surface: ConvexAuthEventSurface } & Record<string, unknown>,
) => void;

export type ConvexAuthRoutePaths = {
  signInPath: string;
  signUpPath: string;
  acceptInvitePath: string;
  postSignInPath: string;
  postSignUpPath: string;
  chooseOrganizationPath: string;
};

export type ConvexAuthFlowStorage = {
  markPendingAuthFlow: (flow: ConvexAuthPendingFlow, state?: ConvexAuthPendingFlowState) => void;
  consumePendingAuthFlow: (flow: ConvexAuthPendingFlow) => ConvexAuthPendingFlowState | null;
  markPendingPostSignUpSync: () => void;
  clearPendingPostSignUpSync: () => void;
  toSafeRedirectPath: (redirectUrl: string | null | undefined) => string | undefined;
};

export const DEFAULT_AUTH_ROUTE_PATHS = {
  signInPath: "/sign-in",
  signUpPath: "/sign-up",
  acceptInvitePath: "/accept-invite",
  postSignInPath: "/app",
  postSignUpPath: "/post-sign-up",
  chooseOrganizationPath: "/onboarding/choose-organization",
} as const satisfies ConvexAuthRoutePaths;

const DEFAULT_STORAGE_KEY_PREFIX = "convex.auth";

export function createConvexAuthRoutePaths(
  overrides: Partial<ConvexAuthRoutePaths> = {},
): ConvexAuthRoutePaths {
  return {
    ...DEFAULT_AUTH_ROUTE_PATHS,
    ...overrides,
  };
}

export function createConvexAuthFlowStorage(
  args: {
    storage?: ConvexAuthStorageLike;
    storageKeyPrefix?: string;
    currentOrigin?: string;
  } = {},
): ConvexAuthFlowStorage {
  const storageKeyPrefix = args.storageKeyPrefix ?? DEFAULT_STORAGE_KEY_PREFIX;

  function getStorage(): ConvexAuthStorageLike | undefined {
    return args.storage ?? getBrowserSessionStorage();
  }

  return {
    markPendingAuthFlow(flow, state = {}) {
      markConvexPendingAuthFlow({
        flow,
        state,
        storage: getStorage(),
        storageKeyPrefix,
      });
    },
    consumePendingAuthFlow(flow) {
      return consumeConvexPendingAuthFlow({
        flow,
        storage: getStorage(),
        storageKeyPrefix,
      });
    },
    markPendingPostSignUpSync() {
      markPendingPostSignUpSyncStorage({
        storage: getStorage(),
        pendingKey: getConvexPendingPostSignUpStorageKey(storageKeyPrefix),
      });
    },
    clearPendingPostSignUpSync() {
      clearPendingPostSignUpSyncStorage({
        storage: getStorage(),
        pendingKey: getConvexPendingPostSignUpStorageKey(storageKeyPrefix),
        failureKey: getConvexPostSignUpFailureStorageKey(storageKeyPrefix),
      });
    },
    toSafeRedirectPath(redirectUrl) {
      return toSafeConvexRedirectPath(redirectUrl, args.currentOrigin);
    },
  };
}

export function createConvexAuthEventCapture(
  captureEvent: (
    eventName: string,
    properties: { surface: ConvexAuthEventSurface } & Record<string, unknown>,
  ) => void,
): ConvexAuthEventCapture {
  return (eventName, properties) => {
    captureEvent(eventName, properties);
  };
}

export function toSafeConvexRedirectPath(
  redirectUrl: string | null | undefined,
  currentOrigin = getBrowserOrigin(),
): string | undefined {
  if (!redirectUrl) {
    return undefined;
  }

  if (redirectUrl.startsWith("//")) {
    return undefined;
  }

  if (redirectUrl.startsWith("/")) {
    return redirectUrl;
  }

  if (!currentOrigin) {
    return undefined;
  }

  try {
    const parsed = new URL(redirectUrl, currentOrigin);
    if (parsed.origin !== currentOrigin) {
      return undefined;
    }
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return undefined;
  }
}

export function getConvexPendingAuthFlowStorageKey(args: {
  flow: ConvexAuthPendingFlow;
  storageKeyPrefix?: string;
}): string {
  return `${args.storageKeyPrefix ?? DEFAULT_STORAGE_KEY_PREFIX}.pending.${args.flow}`;
}

export function getConvexPendingPostSignUpStorageKey(storageKeyPrefix?: string): string {
  return `${storageKeyPrefix ?? DEFAULT_STORAGE_KEY_PREFIX}.pending-post-sign-up`;
}

export function getConvexPostSignUpFailureStorageKey(storageKeyPrefix?: string): string {
  return `${storageKeyPrefix ?? DEFAULT_STORAGE_KEY_PREFIX}.post-sign-up-failure`;
}

function markConvexPendingAuthFlow(args: {
  flow: ConvexAuthPendingFlow;
  state: ConvexAuthPendingFlowState;
  storage?: ConvexAuthStorageLike;
  storageKeyPrefix?: string;
}): void {
  const payload: ConvexAuthPendingFlowState = {};
  if (args.state.redirectPath) {
    payload.redirectPath = args.state.redirectPath;
  }

  args.storage?.setItem(
    getConvexPendingAuthFlowStorageKey({
      flow: args.flow,
      storageKeyPrefix: args.storageKeyPrefix,
    }),
    JSON.stringify(payload),
  );
}

function consumeConvexPendingAuthFlow(args: {
  flow: ConvexAuthPendingFlow;
  storage?: ConvexAuthStorageLike;
  storageKeyPrefix?: string;
}): ConvexAuthPendingFlowState | null {
  const storageKey = getConvexPendingAuthFlowStorageKey({
    flow: args.flow,
    storageKeyPrefix: args.storageKeyPrefix,
  });
  const value = args.storage?.getItem(storageKey);
  if (!value) {
    return null;
  }

  args.storage?.removeItem(storageKey);

  try {
    const parsed: unknown = JSON.parse(value);
    if (typeof parsed !== "object" || parsed === null) {
      return {};
    }
    const redirectPath = Reflect.get(parsed, "redirectPath");
    return typeof redirectPath === "string" ? { redirectPath } : {};
  } catch {
    return {};
  }
}

function getBrowserOrigin(): string | undefined {
  return typeof window === "undefined" ? undefined : window.location.origin;
}
