import "server-only";

import { fetchAction } from "convex/nextjs";
import { NextRequest, NextResponse } from "next/server";
import type { FunctionReference } from "convex/server";
import {
  runAuthProxy,
  shouldProxyAuthAction as shouldProxyRequest,
  type AuthProxyIntent,
  type AuthProxyOptions,
} from "../../ssr/proxy.js";
import type { NativeAuthActions } from "../../react/ConvexAuthProvider.js";
import { getRequestCookies } from "./cookies.js";
import { getConvexNextjsOptions, jsonResponse, logVerbose, setAuthCookies } from "./utils.js";

type ProxyActions = Pick<NativeAuthActions, "signUp" | "signIn" | "signOut" | "updateSession"> &
  Partial<
    Pick<
      NativeAuthActions,
      | "signInAnonymous"
      | "linkAnonymousAccount"
      | "verifyEmailOtp"
      | "callback"
      | "twoFactorVerifyTOTP"
      | "twoFactorVerifyBackupCode"
      | "verifyPasskeyAuthentication"
    >
  >;

export type ConvexAuthProxyOptions = {
  convexUrl?: string;
  verbose?: boolean;
  cookieConfig?: { maxAge: number | null };
  actions: ProxyActions;
};

export async function proxyAuthActionToConvex(
  request: NextRequest,
  options: ConvexAuthProxyOptions,
) {
  const cookieConfig = options?.cookieConfig ?? { maxAge: null };
  const verbose = options?.verbose ?? false;
  const proxyOptions: AuthProxyOptions<FunctionReference<"action">> = options;
  return runAuthProxy<FunctionReference<"action">, NextResponse>(request, proxyOptions, {
    readCookies: () => getRequestCookies(),
    jsonResponse,
    writeCookies: (response, tokens) => setAuthCookies(response, tokens, cookieConfig),
    callAction: (action, args, opts) =>
      fetchAction(action, args as never, {
        ...getConvexNextjsOptions(options),
        ...opts,
      }),
    log: (message) => logVerbose(message, verbose),
  });
}

export type { AuthProxyIntent };

export function shouldProxyAuthAction(request: NextRequest, apiRoute: string) {
  return shouldProxyRequest(request, apiRoute);
}
