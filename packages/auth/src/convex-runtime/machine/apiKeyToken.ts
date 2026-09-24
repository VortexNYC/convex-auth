import { hashApiKeySecret, verifyApiKeySecret } from "./apiKeySecret";

/**
 * A well-formed (64-hex, SHA-256-shaped) hash that no real secret hashes to.
 * Used to run the constant-cost verify on a prefix miss so the response time of
 * "unknown prefix" matches "known prefix, wrong secret".
 */
const DUMMY_KEY_HASH = "0".repeat(64);

export type ParsedApiKeyToken =
  | {
      ok: true;
      keyPrefix: string;
      secret: string;
    }
  | {
      ok: false;
      reason: "missing_separator" | "missing_prefix" | "missing_secret";
    };

export type StoredApiKeyCredential = {
  keyPrefix: string;
  keyHash: string;
  status: "active" | "revoked";
  expiresAt?: number | null;
};

export type ResolveStoredApiKeyCredentialResult<TApiKey extends StoredApiKeyCredential> =
  | {
      ok: true;
      apiKey: TApiKey;
      keyPrefix: string;
    }
  | {
      ok: false;
      reason: "invalid_format" | "invalid_key" | "invalid_secret" | "expired";
    };

export function createApiKeyPrefix(args: {
  tokenPrefix: string;
  randomUUID?: () => string;
}): string {
  const randomUUID = args.randomUUID ?? crypto.randomUUID.bind(crypto);
  return `${args.tokenPrefix}_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
}

export function createApiKeySecret(args: { randomUUID?: () => string } = {}): string {
  const randomUUID = args.randomUUID ?? crypto.randomUUID.bind(crypto);
  return randomUUID().replace(/-/g, "") + randomUUID().replace(/-/g, "");
}

export function formatApiKeyToken(args: { keyPrefix: string; secret: string }): string {
  return `${args.keyPrefix}.${args.secret}`;
}

export function parseApiKeyToken(token: string): ParsedApiKeyToken {
  const separatorIndex = token.indexOf(".");
  if (separatorIndex === -1) {
    return { ok: false, reason: "missing_separator" };
  }

  const keyPrefix = token.slice(0, separatorIndex);
  if (keyPrefix.length === 0) {
    return { ok: false, reason: "missing_prefix" };
  }

  const secret = token.slice(separatorIndex + 1);
  if (secret.length === 0) {
    return { ok: false, reason: "missing_secret" };
  }

  return { ok: true, keyPrefix, secret };
}

export async function resolveStoredApiKeyCredential<TApiKey extends StoredApiKeyCredential>(args: {
  token: string;
  findByKeyPrefix: (keyPrefix: string) => Promise<TApiKey | null>;
  hashSecret?: (secret: string) => Promise<string>;
  now?: number;
}): Promise<ResolveStoredApiKeyCredentialResult<TApiKey>> {
  const parsed = parseApiKeyToken(args.token);
  if (!parsed.ok) {
    return { ok: false, reason: "invalid_format" };
  }

  const apiKey = await args.findByKeyPrefix(parsed.keyPrefix);
  const hashSecret = args.hashSecret ?? hashApiKeySecret;

  /**
   * Always run the (expensive) hash+compare, even when the prefix is unknown, so
   * response time does not reveal whether a prefix exists (timing oracle). On a
   * miss we compare against a fixed dummy hash and discard the result.
   */
  const secretMatches = await verifyApiKeySecret({
    secret: parsed.secret,
    expectedHash: apiKey?.keyHash ?? DUMMY_KEY_HASH,
    hashSecret,
  });

  if (apiKey === null || apiKey.status !== "active") {
    return { ok: false, reason: "invalid_key" };
  }
  if (!secretMatches) {
    return { ok: false, reason: "invalid_secret" };
  }

  const now = args.now ?? Date.now();
  if (apiKey.expiresAt !== undefined && apiKey.expiresAt !== null && apiKey.expiresAt <= now) {
    return { ok: false, reason: "expired" };
  }

  return {
    ok: true,
    apiKey,
    keyPrefix: parsed.keyPrefix,
  };
}
