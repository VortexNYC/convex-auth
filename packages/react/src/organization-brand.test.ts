/**
 * Unit coverage for suite tenant brand metadata helpers (VOR-182).
 */
import assert from "node:assert/strict";

import { describe, it } from "vitest";

import {
  mergeOrganizationBrandIntoMetadataJson,
  parseOrganizationBrandFromMetadataJson,
  ORGANIZATION_BRAND_METADATA_KEY,
} from "./organization-brand";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

describe("organization brand metadata (VOR-182)", () => {
  it("returns undefined for empty / invalid metadata", () => {
    assert.equal(parseOrganizationBrandFromMetadataJson(undefined), undefined);
    assert.equal(parseOrganizationBrandFromMetadataJson(""), undefined);
    assert.equal(parseOrganizationBrandFromMetadataJson("{"), undefined);
    assert.equal(parseOrganizationBrandFromMetadataJson("[]"), undefined);
  });

  it("parses brand fields from metadataJson", () => {
    const brand = parseOrganizationBrandFromMetadataJson(
      JSON.stringify({
        [ORGANIZATION_BRAND_METADATA_KEY]: {
          primaryColor: "#0F172A",
          accentColor: "  #38BDF8 ",
          website: "https://acme.example",
          emailFromName: "Acme",
          emailReplyTo: "hello@acme.example",
          ignored: true,
        },
        other: 1,
      }),
    );
    assert.deepEqual(brand, {
      primaryColor: "#0F172A",
      accentColor: "#38BDF8",
      website: "https://acme.example",
      emailFromName: "Acme",
      emailReplyTo: "hello@acme.example",
    });
  });

  it("merges brand updates and preserves sibling metadata keys", () => {
    const next = mergeOrganizationBrandIntoMetadataJson(JSON.stringify({ keep: true }), {
      primaryColor: "#111111",
      emailFromName: "Example",
    });
    assert.ok(next);
    const parsed: unknown = JSON.parse(next);
    assert.ok(isRecord(parsed));
    assert.equal(parsed.keep, true);
    assert.deepEqual(parsed[ORGANIZATION_BRAND_METADATA_KEY], {
      primaryColor: "#111111",
      emailFromName: "Example",
    });
  });

  it("clears brand fields with null and drops empty brand object", () => {
    const seeded = mergeOrganizationBrandIntoMetadataJson(undefined, {
      primaryColor: "#000",
      website: "https://x.test",
    });
    const cleared = mergeOrganizationBrandIntoMetadataJson(seeded, {
      primaryColor: null,
      website: null,
    });
    assert.equal(cleared, undefined);
  });
});
