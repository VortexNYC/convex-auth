export type InviteSignUpUrlOptions = {
  baseSignUpUrl?: string | null;
  fallbackSignUpPath: string;
  currentOrigin: string;
  currentSearch: string;
  afterSignUpPath: string;
  emailAddress?: string | null;
  currentWindowOrigin?: string | null;
};

export type InviteAcceptRedirectResult =
  | {
      isRedirectable: true;
      invitationToken: string;
      redirectPath: string | undefined;
      signUpUrl: string;
    }
  | {
      isRedirectable: false;
      reason: "invitation_unavailable" | "missing_ticket";
    };

function readParams(currentSearch: string): URLSearchParams {
  const normalizedSearch = currentSearch.startsWith("?") ? currentSearch.slice(1) : currentSearch;
  return new URLSearchParams(normalizedSearch);
}

export function getInvitationToken(params: URLSearchParams): string | null {
  return params.get("invitation_token") ?? params.get("token");
}

export function getAfterSignUpPath(
  currentSearch: string,
  defaultPath: string,
  currentWindowOrigin = typeof window === "undefined" ? null : window.location.origin,
): string {
  const params = readParams(currentSearch);
  const requestedRedirect = params.get("redirect_url");
  if (!requestedRedirect) {
    return defaultPath;
  }

  if (requestedRedirect.startsWith("/")) {
    return requestedRedirect;
  }

  try {
    const parsed = new URL(requestedRedirect);
    if (currentWindowOrigin !== null && parsed.origin === currentWindowOrigin) {
      return `${parsed.pathname}${parsed.search}${parsed.hash}`;
    }
  } catch {
    return defaultPath;
  }

  return defaultPath;
}

export function buildInviteSignUpUrl({
  baseSignUpUrl,
  fallbackSignUpPath,
  currentOrigin,
  currentSearch,
  afterSignUpPath,
  emailAddress,
}: InviteSignUpUrlOptions): string {
  const params = readParams(currentSearch);
  const signUpUrl = new URL(baseSignUpUrl ?? fallbackSignUpPath, currentOrigin);

  const invitationToken = getInvitationToken(params);
  if (invitationToken) {
    signUpUrl.searchParams.set("invitation_token", invitationToken);
  }

  const normalizedEmail = emailAddress ?? params.get("email_address") ?? params.get("email");
  if (normalizedEmail) {
    signUpUrl.searchParams.set("email_address", normalizedEmail);
    signUpUrl.searchParams.set("identifier", normalizedEmail);
  }

  const absoluteAfterSignUp = new URL(afterSignUpPath, currentOrigin).toString();
  signUpUrl.searchParams.set("redirect_url", absoluteAfterSignUp);

  return signUpUrl.toString();
}

export async function prepareInviteAcceptRedirect(args: {
  baseSignUpUrl?: string | null;
  fallbackSignUpPath: string;
  currentOrigin: string;
  currentSearch: string;
  afterSignUpPath: string;
  getInvitationEmail?: (invitationToken: string, params: URLSearchParams) => Promise<string | null>;
  toSafeRedirectPath?: (url: string) => string | undefined;
}): Promise<InviteAcceptRedirectResult> {
  const params = readParams(args.currentSearch);
  const invitationToken = getInvitationToken(params);
  if (!invitationToken) {
    return {
      isRedirectable: false,
      reason: "missing_ticket",
    };
  }

  let emailAddress = params.get("email_address") ?? params.get("email") ?? null;
  if (args.getInvitationEmail !== undefined) {
    const resolvedEmail = await args.getInvitationEmail(invitationToken, params);
    if (resolvedEmail === null) {
      return {
        isRedirectable: false,
        reason: "invitation_unavailable",
      };
    }
    emailAddress = resolvedEmail || emailAddress;
  }

  const signUpUrl = buildInviteSignUpUrl({
    baseSignUpUrl: args.baseSignUpUrl,
    fallbackSignUpPath: args.fallbackSignUpPath,
    currentOrigin: args.currentOrigin,
    currentSearch: args.currentSearch,
    afterSignUpPath: args.afterSignUpPath,
    emailAddress,
  });

  return {
    isRedirectable: true,
    invitationToken,
    redirectPath: args.toSafeRedirectPath?.(signUpUrl),
    signUpUrl,
  };
}
