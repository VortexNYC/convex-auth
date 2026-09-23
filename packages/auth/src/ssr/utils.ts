/**
 * Framework-neutral helpers shared by SSR adapters. Pure Web APIs.
 */

export function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: {
      "Content-Type": "application/json",
      // Proxy responses carry session state (tokens, Set-Cookie) — they must
      // never be shared-cached. POSTs aren't cacheable by default, but an
      // explicit no-store is the documented contract.
      "Cache-Control": "private, no-store",
    },
    status,
  });
}

export function isCorsRequest(request: Request) {
  const origin = request.headers.get("Origin");
  if (origin === null) {
    return false;
  }
  // A malformed Origin cannot be proven same-origin — treat as cross-origin.
  try {
    const originURL = new URL(origin);
    return (
      originURL.host !== request.headers.get("Host") ||
      originURL.protocol !== new URL(request.url).protocol
    );
  } catch {
    return true;
  }
}

export function logVerbose(message: string, verbose: boolean, adapter = "ConvexAuth") {
  if (verbose) {
    console.debug(`[verbose] ${new Date().toISOString()} [${adapter}] ${message}`);
  }
}

export function decodeTokenClaims(token: string): { exp?: number; iat?: number } | null {
  const parts = token.split(".");
  if (parts.length !== 3 || !parts[1]) {
    return null;
  }
  const normalized = parts[1].replace(/-/g, "+").replace(/_/g, "/");
  const padding = (4 - (normalized.length % 4)) % 4;
  try {
    return JSON.parse(atob(normalized + "=".repeat(padding))) as {
      exp?: number;
      iat?: number;
    };
  } catch {
    return null;
  }
}
