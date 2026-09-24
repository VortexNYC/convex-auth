import assert from "node:assert/strict";

import { describe, it } from "vitest";

import {
  assertMcpOAuthClientIdMetadataUrl,
  isMcpOAuthClientIdMetadataAddressAllowed,
  validateMcpOAuthClientIdMetadataDocument,
} from "./clientIdMetadata";

const CLIENT_ID = "https://client.dev/oauth/metadata.json";

function document(overrides: Record<string, unknown> = {}) {
  return {
    client_id: CLIENT_ID,
    client_name: "client.dev",
    client_uri: "https://client.dev",
    redirect_uris: ["https://client.dev/oauth/callback"],
    ...overrides,
  };
}

describe("assertMcpOAuthClientIdMetadataUrl", () => {
  it("accepts an https metadata URL", () => {
    const result = assertMcpOAuthClientIdMetadataUrl(CLIENT_ID);
    assert.equal(result.ok, true);
  });

  it("rejects plaintext http", () => {
    /** Metadata fetched over http can be rewritten in flight. */
    const result = assertMcpOAuthClientIdMetadataUrl("http://client.dev/oauth/metadata.json");
    assert.equal(result.ok, false);
  });

  it("rejects embedded credentials and fragments", () => {
    for (const candidate of [
      "https://user:pass@client.dev/metadata.json",
      "https://client.dev/metadata.json#frag",
    ]) {
      assert.equal(assertMcpOAuthClientIdMetadataUrl(candidate).ok, false);
    }
  });

  it("rejects non-URL client ids", () => {
    assert.equal(assertMcpOAuthClientIdMetadataUrl("mcp_abc123").ok, false);
  });

  it("refuses to fetch our own network (SSRF)", () => {
    /**
     * The client chooses what the server connects to, so these are the
     * cheapest paths to internal services and cloud metadata.
     */
    for (const candidate of [
      "https://localhost/metadata.json",
      "https://127.0.0.1/metadata.json",
      "https://10.1.2.3/metadata.json",
      "https://192.168.1.10/metadata.json",
      "https://172.16.9.9/metadata.json",
      "https://169.254.169.254/latest/meta-data",
      "https://metadata.google.internal/metadata.json",
      "https://svc.internal/metadata.json",
      "https://box.local/metadata.json",
      "https://[::1]/metadata.json",
    ]) {
      assert.equal(
        assertMcpOAuthClientIdMetadataUrl(candidate).ok,
        false,
        `expected ${candidate} to be refused`,
      );
    }
  });
});

describe("isMcpOAuthClientIdMetadataAddressAllowed", () => {
  it("blocks private and link-local ranges", () => {
    for (const address of [
      "10.0.0.1",
      "127.0.0.1",
      "169.254.169.254",
      "172.31.255.254",
      "192.168.0.1",
      "100.64.0.1",
      "::1",
      "fd00::1",
      "fe80::1",
      "::ffff:10.0.0.1",
    ]) {
      assert.equal(
        isMcpOAuthClientIdMetadataAddressAllowed(address),
        false,
        `expected ${address} to be blocked`,
      );
    }
  });

  it("allows public addresses", () => {
    for (const address of ["1.1.1.1", "93.184.216.34", "2606:4700::1111"]) {
      assert.equal(isMcpOAuthClientIdMetadataAddressAllowed(address), true);
    }
  });

  it("blocks non-canonical spellings of the same address", () => {
    /**
     * A resolver returns whatever form it was given: dns.lookup yields
     * `0:0:0:0:0:0:0:1`, not `::1`. Matching one spelling admits the rest.
     */
    for (const address of [
      "0:0:0:0:0:0:0:1",
      "0:0:0:0:0:0:0:0",
      "0:0:0:0:0:ffff:127.0.0.1",
      "0000:0000:0000:0000:0000:0000:0000:0001",
      "fe80:0:0:0:0:0:0:1",
      "fd00:0:0:0:0:0:0:1",
      "::1%lo0",
    ]) {
      assert.equal(
        isMcpOAuthClientIdMetadataAddressAllowed(address),
        false,
        `expected ${address} to be blocked`,
      );
    }
  });

  it("blocks IPv4-mapped addresses in hex form", () => {
    /**
     * Node normalises [::ffff:10.0.0.1] to [::ffff:a00:1], so the dotted
     * spelling never reaches this guard through a real URL.
     */
    for (const address of [
      "::ffff:a00:1", // 10.0.0.1
      "::ffff:7f00:1", // 127.0.0.1
      "0:0:0:0:0:ffff:a9fe:a9", // 169.254.169.254
      "::ffff:c0a8:1", // 192.168.0.1
    ]) {
      assert.equal(
        isMcpOAuthClientIdMetadataAddressAllowed(address),
        false,
        `expected ${address} to be blocked`,
      );
    }
  });

  it("refuses an address it cannot parse", () => {
    for (const address of ["::gggg", "1:2:3::4::5", "12345::1"]) {
      assert.equal(isMcpOAuthClientIdMetadataAddressAllowed(address), false);
    }
  });
});

describe("CIMD URL guard against normalised IPv6 literals", () => {
  it("refuses private addresses that survive URL normalisation", () => {
    /**
     * The layer that matters: by the time a client_id reaches us, the URL
     * parser has already rewritten the host. These are the forms it produces.
     */
    for (const literal of [
      "::ffff:10.0.0.1",
      "::ffff:127.0.0.1",
      "::ffff:169.254.169.254",
      "::ffff:192.168.0.1",
      "0:0:0:0:0:0:0:1",
    ]) {
      const normalisedHost = new URL(`https://[${literal}]/m.json`).hostname;
      const clientId = `https://${normalisedHost}/m.json`;
      assert.equal(
        assertMcpOAuthClientIdMetadataUrl(clientId).ok,
        false,
        `expected ${literal} (normalised ${normalisedHost}) to be refused`,
      );
    }
  });

  it("still accepts a public IPv6 literal", () => {
    const host = new URL("https://[2606:4700::1111]/m.json").hostname;
    assert.equal(assertMcpOAuthClientIdMetadataUrl(`https://${host}/m.json`).ok, true);
  });
});

describe("validateMcpOAuthClientIdMetadataDocument", () => {
  it("accepts a well-formed document", () => {
    const result = validateMcpOAuthClientIdMetadataDocument({
      clientIdUrl: CLIENT_ID,
      document: document(),
    });

    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.clientId, CLIENT_ID);
    assert.deepEqual(result.redirectUris, ["https://client.dev/oauth/callback"]);
    assert.equal(result.clientUriOriginMismatch, false);
  });

  it("rejects a document claiming a different client_id", () => {
    /**
     * The binding that makes CIMD safe: without it any origin could serve a
     * document impersonating another client.
     */
    const result = validateMcpOAuthClientIdMetadataDocument({
      clientIdUrl: CLIENT_ID,
      document: document({ client_id: "https://evil.example/metadata.json" }),
    });

    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.error, "invalid_client_metadata");
    assert.match(result.errorDescription, /must match the URL/u);
  });

  it("requires redirect_uris", () => {
    const result = validateMcpOAuthClientIdMetadataDocument({
      clientIdUrl: CLIENT_ID,
      document: document({ redirect_uris: [] }),
    });

    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.match(result.errorDescription, /redirect_uris/u);
  });

  it("rejects wildcard and non-https redirect uris", () => {
    for (const redirect of ["https://client.dev/*", "http://client.dev/callback"]) {
      const result = validateMcpOAuthClientIdMetadataDocument({
        clientIdUrl: CLIENT_ID,
        document: document({ redirect_uris: [redirect] }),
      });
      assert.equal(result.ok, false, `expected ${redirect} to be refused`);
    }
  });

  it("allows a loopback redirect for native clients", () => {
    const result = validateMcpOAuthClientIdMetadataDocument({
      clientIdUrl: CLIENT_ID,
      document: document({ redirect_uris: ["http://127.0.0.1:7842/callback"] }),
    });
    assert.equal(result.ok, true);
  });

  it("flags a cross-origin client_uri without failing", () => {
    /**
     * Usable, but the consent screen must be able to say the displayed
     * identity is not the origin that served the document.
     */
    const result = validateMcpOAuthClientIdMetadataDocument({
      clientIdUrl: CLIENT_ID,
      document: document({ client_uri: "https://trusted-brand.example" }),
    });

    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.clientUriOriginMismatch, true);
  });

  it("rejects a non-object document", () => {
    const result = validateMcpOAuthClientIdMetadataDocument({
      clientIdUrl: CLIENT_ID,
      document: "not json",
    });
    assert.equal(result.ok, false);
  });
});
