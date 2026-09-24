import { decodeProtectedHeader, importJWK, jwtVerify } from "jose";

import type { McpOAuthClientAssertionResult, McpOAuthClientAssertionVerifyArgs } from "./types";

/**
 * RFC 7523 client assertion type. The only value the token endpoint accepts.
 */
export const MCP_OAUTH_CLIENT_ASSERTION_TYPE =
  "urn:ietf:params:oauth:client-assertion-type:jwt-bearer" as const;

/**
 * Maximum assertion lifetime we will honour, regardless of the client's `exp`.
 *
 * RFC 7523 leaves lifetime to the authorization server. A client that mints a
 * year-long assertion has effectively recreated the long-lived shared secret
 * this format exists to avoid, so cap it.
 */
export const MCP_OAUTH_CLIENT_ASSERTION_MAX_LIFETIME_SECONDS = 300;

/**
 * Verify a `private_key_jwt` client assertion.
 *
 * This is the credential format the MCP `oauth-client-credentials` extension
 * recommends over client secrets: the client signs with a private key we never
 * hold, so there is no shared secret to leak, and each assertion is short-lived
 * rather than standing.
 *
 * Checks, in order: the assertion type, that the signing key belongs to the
 * client that claims to be calling, the signature under that client's own
 * registered algorithm, and RFC 7523's claim set (`iss` and `sub` both the
 * client id, `aud` the token endpoint, `exp` present and bounded).
 *
 * Key selection: when the assertion names a `kid` it must match a registered
 * key; when it does not, a single registered key is unambiguous and anything
 * else fails. The verify is pinned to the key's own algorithm rather than the
 * assertion header's — trusting the header would let a caller downgrade the
 * algorithm and forge an assertion.
 *
 * RFC 7523 §3: for client authentication `iss` and `sub` are both the client;
 * enforcing both stops a client signing an assertion that names another.
 *
 * The returned `assertionId` is the JWT `jti`, surfaced so the caller can
 * reject replays. Assertions are short-lived, so a replay store need only
 * retain ids until they expire.
 */
export async function verifyMcpOAuthClientAssertion(
  args: McpOAuthClientAssertionVerifyArgs,
): Promise<McpOAuthClientAssertionResult> {
  if (args.assertionType !== MCP_OAUTH_CLIENT_ASSERTION_TYPE) {
    return failure(
      `Unsupported client_assertion_type. Expected ${MCP_OAUTH_CLIENT_ASSERTION_TYPE}`,
    );
  }

  if (args.assertion.length === 0) {
    return failure("client_assertion is required");
  }

  let keyId: string | null = null;
  try {
    const header = decodeProtectedHeader(args.assertion);
    keyId = typeof header.kid === "string" ? header.kid : null;
  } catch {
    return failure("client_assertion is not a well-formed JWT");
  }

  const candidateKeys = args.clientKeys;
  if (candidateKeys.length === 0) {
    return failure("Client has no registered assertion key");
  }
  const key =
    keyId === null
      ? candidateKeys.length === 1
        ? candidateKeys[0]
        : null
      : (candidateKeys.find((candidate) => candidate.keyId === keyId) ?? null);
  if (key === undefined || key === null) {
    return failure("Client assertion key not found");
  }

  const now = args.now ?? Date.now();
  let payload: Record<string, unknown>;
  try {
    const verified = await jwtVerify(
      args.assertion,
      await importJWK(key.publicJwk, key.algorithm),
      {
        algorithms: [key.algorithm],
        audience: args.tokenEndpoint,
        currentDate: new Date(now),
      },
    );
    payload = { ...verified.payload };
  } catch {
    return failure("client_assertion signature or claims are invalid");
  }

  if (payload.iss !== args.clientId || payload.sub !== args.clientId) {
    return failure("client_assertion iss and sub must both be the client id");
  }

  const expiresAt = typeof payload.exp === "number" ? payload.exp : null;
  if (expiresAt === null) {
    return failure("client_assertion must set exp");
  }

  const lifetimeSeconds = expiresAt - Math.floor(now / 1000);
  if (lifetimeSeconds > MCP_OAUTH_CLIENT_ASSERTION_MAX_LIFETIME_SECONDS) {
    return failure(
      `client_assertion exp exceeds the ${MCP_OAUTH_CLIENT_ASSERTION_MAX_LIFETIME_SECONDS}s maximum lifetime`,
    );
  }

  return {
    ok: true,
    clientId: args.clientId,
    keyId: key.keyId,
    assertionId: typeof payload.jti === "string" ? payload.jti : null,
    expiresAt,
  };
}

function failure(description: string): McpOAuthClientAssertionResult {
  return { ok: false, error: "invalid_client", errorDescription: description };
}
