import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const COMPONENT_ROOT = dirname(fileURLToPath(import.meta.url));

/**
 * Feature-gated components under `component/<name>/` are byte-for-byte copies
 * of the monolith's `component/<name>.ts` — the only legitimate difference is
 * import specifiers (the gated copy reaches shared modules one level up and
 * its own local schema). Any other divergence is drift: `allowedIpRanges`
 * shipped on the monolith's `issueApiKey`/`issueServiceOwnedApiKey` while the
 * gated twin silently lacked it.
 */
const TWINS = ["apiKeys", "servicePrincipals", "webhooks", "authMd", "agentAuth"] as const;

function normalizeTwin(source: string): string {
  return source
    .replace(/^import[\s\S]*?from\s+"[^"]+";\s*$/gm, "")
    .replace(/^export \* from "[^"]+";\s*$/gm, "")
    .trim();
}

describe("feature-gated component twins", () => {
  for (const name of TWINS) {
    it(`${name}: gated copy matches monolith after import normalization`, () => {
      const flat = normalizeTwin(readFileSync(join(COMPONENT_ROOT, `${name}.ts`), "utf8"));
      const nested = normalizeTwin(readFileSync(join(COMPONENT_ROOT, name, `${name}.ts`), "utf8"));
      expect(nested).toBe(flat);
    });
  }
});
