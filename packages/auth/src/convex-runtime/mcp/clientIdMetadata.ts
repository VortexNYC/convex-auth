import type { McpOAuthClientIdMetadataResult, McpOAuthClientIdMetadataValidateArgs } from "./types";

/**
 * Client ID Metadata Documents (CIMD).
 *
 * MCP's 2026-07-28 spec deprecates Dynamic Client Registration in favour of
 * CIMD: instead of pre-registering, a client presents an HTTPS URL as its
 * `client_id` and the authorization server fetches the metadata document from
 * it. There is no registration table to grow and no stale record to reconcile.
 *
 * The fetch itself belongs to the runtime (it owns the HTTP client, cache, and
 * egress policy). What lives here is everything decidable without I/O: whether
 * a URL is safe to fetch at all, and whether the returned document may be
 * trusted. Splitting it this way keeps the security rules unit-testable rather
 * than reachable only through a live request.
 */

/** Documents are small; a large body is a signal, not a payload. */
export const MCP_OAUTH_CIMD_MAX_DOCUMENT_BYTES = 5120;

/** Balances freshness against hammering a client's origin on every request. */
export const MCP_OAUTH_CIMD_DEFAULT_CACHE_TTL_MS = 10 * 60 * 1000;

/** A chain longer than this is a redirect-based SSRF probe, not a fetch. */
export const MCP_OAUTH_CIMD_MAX_REDIRECTS = 3;

/** Tight enough that a hostile origin cannot hold a request open. */
export const MCP_OAUTH_CIMD_FETCH_TIMEOUT_MS = 5000;

/**
 * Hostnames that must never be fetched.
 *
 * Fetching a caller-supplied URL is server-side request forgery by
 * construction: the client chooses what the server connects to. Blocking
 * loopback and link-local names denies the cheapest path to internal services
 * and cloud metadata endpoints.
 *
 * This is necessary but not sufficient — a public hostname can still resolve to
 * a private address. The runtime must also pin the resolved IP and reject
 * private ranges after resolution; see `isMcpOAuthClientIdMetadataAddressAllowed`.
 */
const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "localhost.localdomain",
  "metadata.google.internal",
  "instance-data",
]);

const BLOCKED_HOSTNAME_SUFFIXES = [".localhost", ".local", ".internal"];

/**
 * Validate that a `client_id` is a URL this server is willing to dereference.
 *
 * Rejects anything that is not HTTPS (plaintext metadata is trivially spoofed),
 * carries credentials or a fragment, or names a host that resolves inside our
 * own network.
 */
export function assertMcpOAuthClientIdMetadataUrl(
  clientId: string,
): { ok: true; url: URL } | { ok: false; errorDescription: string } {
  let url: URL;
  try {
    url = new URL(clientId);
  } catch {
    return { ok: false, errorDescription: "client_id must be an absolute URL" };
  }

  if (url.protocol !== "https:") {
    return { ok: false, errorDescription: "client_id must use https" };
  }
  if (url.username.length > 0 || url.password.length > 0) {
    return {
      ok: false,
      errorDescription: "client_id must not embed credentials",
    };
  }
  if (url.hash.length > 0) {
    return {
      ok: false,
      errorDescription: "client_id must not contain a fragment",
    };
  }
  if (!isHostnameAllowed(url.hostname)) {
    return {
      ok: false,
      errorDescription: "client_id host is not permitted",
    };
  }

  return { ok: true, url };
}

/**
 * Whether the URL's hostname is allowed. A bare IP literal skips DNS entirely,
 * so it is judged here rather than left to the resolver.
 */
function isHostnameAllowed(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/u, "");
  if (host.length === 0 || BLOCKED_HOSTNAMES.has(host)) {
    return false;
  }
  if (BLOCKED_HOSTNAME_SUFFIXES.some((suffix) => host.endsWith(suffix))) {
    return false;
  }
  return isMcpOAuthClientIdMetadataAddressAllowed(stripIpv6Brackets(host));
}

function stripIpv6Brackets(host: string): string {
  return host.startsWith("[") && host.endsWith("]") ? host.slice(1, -1) : host;
}

/**
 * Reject addresses that point back inside our own network.
 *
 * Exported so the runtime can re-apply it to the *resolved* address: a public
 * hostname may still resolve to a private range, and re-resolving between
 * check and connect is the DNS-rebinding hole. Hostnames that are not IP
 * literals pass here and are the runtime's job to resolve.
 *
 * Comparison is numeric, never textual. One address has many spellings —
 * `::1` and `0:0:0:0:0:0:0:1`; `::ffff:10.0.0.1` and `::ffff:a00:1` — and a
 * resolver or URL parser may return any of them. Node normalises
 * `[::ffff:10.0.0.1]` to `[::ffff:a00:1]`, so matching the dotted spelling
 * would admit every private range in its hex form. IPv4-mapped addresses
 * (`::ffff:a.b.c.d`) are judged by the IPv4 address they carry.
 *
 * Blocked: IPv4 10/8, 127/8, 0/8, 169.254/16 (link-local + cloud metadata),
 * 172.16/12, 192.168/16, 100.64/10 (CGNAT); IPv6 unspecified `::`, loopback
 * `::1`, unique-local `fc00::/7`, link-local `fe80::/10`. An address that
 * cannot be parsed is refused — something we cannot evaluate is not something
 * we should connect to.
 */
export function isMcpOAuthClientIdMetadataAddressAllowed(address: string): boolean {
  const ipv4 = parseIpv4(address);
  if (ipv4 !== null) {
    const [a, b] = ipv4;
    if (a === 10 || a === 127 || a === 0) return false;
    if (a === 169 && b === 254) return false;
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a === 192 && b === 168) return false;
    if (a === 100 && b >= 64 && b <= 127) return false;
    return true;
  }

  if (address.includes(":")) {
    const hextets = parseIpv6(address);
    if (hextets === null) {
      return false;
    }

    const isV4Mapped = hextets.slice(0, 5).every((part) => part === 0) && hextets[5] === 0xff_ff;
    if (isV4Mapped) {
      const high = hextets[6] ?? 0;
      const low = hextets[7] ?? 0;
      return isMcpOAuthClientIdMetadataAddressAllowed(
        `${high >> 8}.${high & 0xff}.${low >> 8}.${low & 0xff}`,
      );
    }

    const allZeroPrefix = hextets.slice(0, 7).every((part) => part === 0);
    if (allZeroPrefix && (hextets[7] === 0 || hextets[7] === 1)) {
      return false;
    }

    const first = hextets[0] ?? 0;
    if ((first & 0xfe_00) === 0xfc_00) return false;
    if ((first & 0xff_c0) === 0xfe_80) return false;

    return true;
  }

  return true;
}

/**
 * Parse any RFC 4291/5952 spelling of an IPv6 address into 8 numeric hextets.
 *
 * Handles `::` compression, a dotted-quad tail (`::ffff:10.0.0.1` folds into
 * the final two hextets), and zone ids. Returns null for anything
 * unparseable so the caller refuses it rather than guesses.
 */
function parseIpv6(address: string): number[] | null {
  let text = address.toLowerCase();
  const zone = text.indexOf("%");
  if (zone !== -1) {
    text = text.slice(0, zone);
  }

  const dotted = /^(.*:)(\d+\.\d+\.\d+\.\d+)$/u.exec(text);
  if (dotted !== null) {
    const octets = (dotted[2] ?? "").split(".").map((part) => Number.parseInt(part, 10));
    if (
      octets.length !== 4 ||
      octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)
    ) {
      return null;
    }
    const high = ((octets[0] ?? 0) << 8) | (octets[1] ?? 0);
    const low = ((octets[2] ?? 0) << 8) | (octets[3] ?? 0);
    text = `${dotted[1]}${high.toString(16)}:${low.toString(16)}`;
  }

  const halves = text.split("::");
  if (halves.length > 2) {
    return null;
  }

  const head = parseHextetGroup(halves[0] ?? "");
  if (head === null) {
    return null;
  }

  if (halves.length === 1) {
    return head.length === 8 ? head : null;
  }

  const tail = parseHextetGroup(halves[1] ?? "");
  if (tail === null) {
    return null;
  }
  const missing = 8 - head.length - tail.length;
  if (missing < 1) {
    return null;
  }
  return [...head, ...Array.from<number>({ length: missing }).fill(0), ...tail];
}

function parseHextetGroup(part: string): number[] | null {
  if (part.length === 0) {
    return [];
  }
  const parsed: number[] = [];
  for (const group of part.split(":")) {
    if (!/^[0-9a-f]{1,4}$/u.test(group)) {
      return null;
    }
    parsed.push(Number.parseInt(group, 16));
  }
  return parsed;
}

function parseIpv4(address: string): [number, number] | null {
  const parts = address.split(".");
  if (parts.length !== 4) {
    return null;
  }
  const octets = parts.map((part) => Number.parseInt(part, 10));
  if (octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)) {
    return null;
  }
  return [octets[0] ?? 0, octets[1] ?? 0];
}

/**
 * Validate a fetched metadata document against the URL it came from.
 *
 * The binding that makes CIMD safe is `client_id === the fetched URL`: without
 * it, any origin could serve a document claiming to be another client. The
 * `client_uri` origin check is the impersonation guard the spec calls for — a
 * document hosted at one origin claiming a display identity at another is
 * reported rather than silently trusted, so a consent screen can warn.
 */
export function validateMcpOAuthClientIdMetadataDocument(
  args: McpOAuthClientIdMetadataValidateArgs,
): McpOAuthClientIdMetadataResult {
  const urlCheck = assertMcpOAuthClientIdMetadataUrl(args.clientIdUrl);
  if (!urlCheck.ok) {
    return metadataFailure("invalid_client", urlCheck.errorDescription);
  }

  if (!isRecord(args.document)) {
    return metadataFailure("invalid_client_metadata", "Client metadata must be a JSON object");
  }
  const record = args.document;

  if (record.client_id !== args.clientIdUrl) {
    return metadataFailure(
      "invalid_client_metadata",
      "Client metadata client_id must match the URL it was fetched from",
    );
  }

  const redirectUris = record.redirect_uris;
  if (!Array.isArray(redirectUris) || redirectUris.length === 0) {
    return metadataFailure(
      "invalid_client_metadata",
      "Client metadata missing required 'redirect_uris' field",
    );
  }

  const normalizedRedirectUris: string[] = [];
  for (const candidate of redirectUris) {
    if (typeof candidate !== "string") {
      return metadataFailure("invalid_client_metadata", "redirect_uris must be strings");
    }
    const redirectCheck = validateRedirectUri(candidate);
    if (redirectCheck !== null) {
      return metadataFailure("invalid_client_metadata", redirectCheck);
    }
    normalizedRedirectUris.push(candidate);
  }

  const clientUri = typeof record.client_uri === "string" ? record.client_uri : null;

  return {
    ok: true,
    clientId: args.clientIdUrl,
    clientName: typeof record.client_name === "string" ? record.client_name : args.clientIdUrl,
    clientUri,
    redirectUris: normalizedRedirectUris,
    scope: typeof record.scope === "string" ? record.scope : null,
    clientUriOriginMismatch: clientUri !== null && !isSameOrigin(clientUri, urlCheck.url),
  };
}

/**
 * Validate one `redirect_uris` entry. Returns an error description or null.
 * `http` is permitted only for loopback native clients, per OAuth 2.1;
 * everything else must be `https`.
 */
function validateRedirectUri(candidate: string): string | null {
  let redirect: URL;
  try {
    redirect = new URL(candidate);
  } catch {
    return `redirect_uri is not a valid URL: ${candidate}`;
  }
  if (candidate.includes("*")) {
    return "redirect_uris must be exact; wildcards are not allowed";
  }
  const isLoopback =
    redirect.protocol === "http:" &&
    (redirect.hostname === "127.0.0.1" || redirect.hostname === "[::1]");
  if (redirect.protocol !== "https:" && !isLoopback) {
    return `redirect_uri must use https: ${candidate}`;
  }
  return null;
}

function isSameOrigin(candidate: string, url: URL): boolean {
  try {
    return new URL(candidate).origin === url.origin;
  } catch {
    return false;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function metadataFailure(
  error: "invalid_client" | "invalid_client_metadata",
  errorDescription: string,
): McpOAuthClientIdMetadataResult {
  return { ok: false, error, errorDescription };
}
