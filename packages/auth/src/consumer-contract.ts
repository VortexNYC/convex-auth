/**
 * Consumer contract guardrail.
 *
 * Detects local re-introductions of the org/member/role/invitation/api-key
 * mirror that consumers must NOT keep — the convexAuth component owns truth
 * for those surfaces. Consumers keep only a local `organizations` ANCHOR
 * (mapped by `convexAuthOrganizationId`) and FK domain rows to it.
 *
 * Intended for CI: run the bundled script
 * `scripts/check-consumer-contract.ts` against your consumer's convex dir.
 *
 * See `docs/architecture/consumer-contract.md` for the human-side contract
 * (decision, rules, CI-hygiene lessons).
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

export interface ConsumerContractViolation {
  rule: string;
  file: string;
  line?: number;
  message: string;
}

export interface ConsumerContractResult {
  ok: boolean;
  violations: ConsumerContractViolation[];
}

export interface CheckConsumerContractOptions {
  convexDir: string;
  /**
   * Tables that ARE allowed to carry `convexAuth*Id` / `convex*Id` bridge
   * columns — i.e. the consumer's legitimate anchor tables. Defaults to
   * `["organizations", "users"]`. Override if your consumer's anchor table
   * is named differently (e.g. `tenants`), but every entry should be a
   * deliberate, reviewed choice — bridge columns anywhere else are mirrors.
   */
  legitAnchorTables?: readonly string[];
}

const FORBIDDEN_TABLES = [
  "organization_members",
  "organization_roles",
  "organization_invitations",
  "api_keys",
  "agent_hosts",
  "agent_host_keys",
  "agents",
  "agent_keys",
  "agent_capability_grants",
  "agent_replay_records",
  "agent_host_replay_records",
  "agent_device_authorizations",
  "agent_device_authorization_attempts",
  "agent_auth_audit_events",
  "auth_md_registrations",
  "auth_md_assertions",
  "auth_md_credentials",
  "auth_md_audit_events",
] as const;

/**
 * Default tables allowed to carry `convexAuth*Id` bridge columns: the local
 * `organizations` ANCHOR (maps id ↔ component organization) and the
 * `users` mirror that the legacy adapter populates via sync triggers.
 */
const DEFAULT_ANCHOR_TABLES: readonly string[] = ["organizations", "users"];

/**
 * Column-name pattern for a "bridge" id pointing into the convexAuth
 * component. Matches both canonical names (`convexAuthUserId`,
 * `convexAuthOrganizationId`, `convexAuthMemberId`) and common shorthand
 * (`convexOrgId`, `convexUserId`, `convexMemberId`) — name-agnostic so
 * consumers can't slip a mirror past the rule by renaming the column.
 */
const BRIDGE_COLUMN_PATTERN = /^convex(?:Auth)?[A-Z][A-Za-z0-9_]*Id$/;

const FORBIDDEN_MIRROR_WRITERS = [
  "ensureConvexAuthMember",
  "ensureConvexAuthRole",
  "ensureConvexAuthRoleForTemplate",
  "ensureConvexAuthInvitation",
  "ensureConvexAuthApiKey",
] as const;

/**
 * Component readers that are UNSCOPED on purpose — they resolve a resource by id
 * without binding it to the caller's org, or they return a secret / span all
 * tenants. They exist ONLY for trusted system/server code (membership
 * resolution, the delivery worker, machine-auth, platform admin). Reaching one
 * from a CLIENT-CALLABLE function (a non-`internal*` query/mutation) is the exact
 * cross-tenant-read footgun the audit warned about: an attacker-supplied id flows
 * straight into an unscoped lookup. Tenant-facing code must use the org-scoped
 * reader (`getRole`/`getMember`/`getInvitation`, which require an org) or the
 * org-scoped `list*ByOrganization` queries instead.
 */
const SYSTEM_ONLY_COMPONENT_READERS = [
  "getInvitationByIdForSystem",
  "getMemberByIdForSystem",
  "getWebhookEndpointWithSecret",
  "getServicePrincipal",
  "getServicePrincipalByKey",
  "listOrganizations",
  "registerAgentHost",
  "setAgentHostStatus",
  "revokeAgentHostAsHost",
  "rotateAgentHostKey",
  "rotateAgentHostKeyAsHost",
  "registerAgent",
  "registerAgentWithDeviceAuthorization",
  "decideAgentDeviceAuthorization",
  "pollAgentDeviceAuthorization",
  "setAgentStatus",
  "revokeAgentAsHost",
  "reactivateAgent",
  "reactivateAgentAsHost",
  "rotateAgentKey",
  "rotateAgentKeyAsHost",
  "rotateAgentKeyAsAgent",
  "setAgentCapabilityGrantStatus",
  "getAgentVerificationMaterial",
  "getAgentProtocolVerificationMaterial",
  "getAgentHostProtocolVerificationMaterial",
  "consumeAgentHostRequest",
  "getAgentHostAuthorityStatus",
  "getAgentAuthorityStatus",
  "introspectAgentAuthority",
  "consumeAgentCredential",
  "cascadeRevokedAgentHost",
  "cleanupExpiredAgentReplayRecords",
  "cleanupExpiredAgentHostReplayRecords",
  "registerServiceAuth",
  "completeServiceAuthClaim",
  "pollServiceAuthClaim",
  "consumeServiceAuthAssertion",
  "refreshServiceAuthCredential",
  "introspectServiceAuthCredential",
  "revokeServiceAuthCredentialAsHolder",
  "revokeServiceAuthRegistration",
] as const;

/**
 * Convex function constructors that produce a CLIENT-CALLABLE endpoint. A
 * reference to a system-only reader inside one of these is a violation. The
 * permission/role/admin wrappers are included: they gate on a PERMISSION, not on
 * the resource belonging to the viewer's org, so an unscoped by-id read inside
 * one still leaks cross-tenant.
 */
const TENANT_FACING_FUNCTION_KINDS: ReadonlySet<string> = new Set([
  "query",
  "mutation",
  "permissionQuery",
  "permissionMutation",
  "permissionAny",
  "permissionAll",
  "roleQuery",
  "roleMutation",
  "adminQuery",
  "adminMutation",
]);

/** Exempt: server-only entry points the system readers are meant for. */
const INTERNAL_FUNCTION_KINDS: ReadonlySet<string> = new Set([
  "internalQuery",
  "internalMutation",
  "internalAction",
]);

const CONTRACT_DOC = "docs/(reference)/consumer-contract.mdx";

function isExcluded(relPath: string): boolean {
  // Skip generated code, tests, and node_modules.
  const parts = relPath.split(sep);
  if (parts.includes("_generated")) return true;
  if (parts.includes("node_modules")) return true;
  if (relPath.endsWith(".test.ts") || relPath.endsWith(".test.tsx")) return true;
  return false;
}

function walk(dir: string, base: string, out: string[]): void {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = join(dir, entry);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      walk(full, base, out);
      continue;
    }
    if (!st.isFile()) continue;
    if (!(entry.endsWith(".ts") || entry.endsWith(".tsx"))) continue;
    const rel = relative(base, full);
    if (isExcluded(rel)) continue;
    out.push(full);
  }
}

/**
 * `defineTable("name")` and `name: defineTable(` are the only patterns that
 * indicate LOCAL ownership of a table in a Convex schema. Property keys
 * inside `v.id("organization_members")` or `GenericId<"organization_members">`
 * (component-id types) are NOT violations and must be allowed.
 */
function checkLocalTruthTable(
  line: string,
  lineNo: number,
  relPath: string,
): ConsumerContractViolation[] {
  const found: ConsumerContractViolation[] = [];
  for (const table of FORBIDDEN_TABLES) {
    // Form A: `someName: defineTable(` where someName === table (property declaration in a schema map).
    const propPattern = new RegExp(`(^|[^A-Za-z0-9_])${table}\\s*:\\s*defineTable\\s*\\(`);
    // Form B: `defineTable("table_name"` — defensive; not idiomatic in convex but possible.
    const callPattern = new RegExp(`defineTable\\s*\\(\\s*["'\`]${table}["'\`]`);
    if (propPattern.test(line) || callPattern.test(line)) {
      found.push({
        rule: "local-org-member-truth-table",
        file: relPath,
        line: lineNo,
        message: `Local defineTable for "${table}" — the convexAuth component owns this table. Remove it and FK domain rows to the local organizations anchor instead. See ${CONTRACT_DOC}.`,
      });
    }
  }
  return found;
}

function normalizeTableExportName(name: string): string {
  return name
    .replace(/Table$/, "")
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .toLowerCase();
}

function tableNameFromSchemaPath(relPath: string): string | null {
  const normalized = relPath.replaceAll("\\", "/");
  const match = normalized.match(/(?:^|\/)schemas\/([^/.]+)\.tsx?$/);
  return match?.[1] ?? null;
}

function checkSplitSchemaTruthTable(source: string, relPath: string): ConsumerContractViolation[] {
  const tableFromPath = tableNameFromSchemaPath(relPath);
  if (
    tableFromPath === null ||
    !FORBIDDEN_TABLES.some((tableName) => tableName === tableFromPath)
  ) {
    return [];
  }

  const defineTableExport = /export\s+const\s+([A-Za-z_][A-Za-z0-9_]*)\s*=\s*defineTable\s*\(/g;
  const found: ConsumerContractViolation[] = [];
  let match: RegExpExecArray | null;
  while ((match = defineTableExport.exec(source)) !== null) {
    const exportedName = match[1] ?? "";
    if (normalizeTableExportName(exportedName) !== tableFromPath) continue;
    found.push({
      rule: "local-org-member-truth-table",
      file: relPath,
      line: source.slice(0, match.index).split(/\r?\n/).length,
      message: `Local split-schema defineTable for "${tableFromPath}" — the convexAuth component owns this table. Remove it and FK domain rows to the local organizations anchor instead. See ${CONTRACT_DOC}.`,
    });
  }

  return found;
}

function checkLocalMirrorWrite(
  line: string,
  lineNo: number,
  relPath: string,
): ConsumerContractViolation[] {
  const found: ConsumerContractViolation[] = [];
  for (const table of FORBIDDEN_TABLES) {
    const insertPattern = new RegExp(
      `ctx\\.db\\.(?:insert|replace|patch)\\s*\\(\\s*["'\`]${table}["'\`]`,
    );
    if (insertPattern.test(line)) {
      found.push({
        rule: "local-mirror-write",
        file: relPath,
        line: lineNo,
        message: `Local write into "${table}" — component owns truth; consumers must not insert/replace/patch this table. See ${CONTRACT_DOC}.`,
      });
    }
  }
  return found;
}

function checkBidirectionalMirrorWriter(
  line: string,
  lineNo: number,
  relPath: string,
): ConsumerContractViolation[] {
  const found: ConsumerContractViolation[] = [];
  for (const name of FORBIDDEN_MIRROR_WRITERS) {
    // Detect function declaration / arrow assignment / export of the symbol.
    // Allow `ensureConvexAuthOrganization` — that's the sanctioned anchor mapper.
    const decl = new RegExp(
      `(?:^|[^A-Za-z0-9_])(?:function\\s+|const\\s+|let\\s+|var\\s+|export\\s+(?:async\\s+)?function\\s+|export\\s+const\\s+|export\\s+let\\s+|export\\s+\\{[^}]*\\b)${name}(?:\\b|\\s|\\()`,
    );
    if (decl.test(line)) {
      found.push({
        rule: "bidirectional-mirror-writer",
        file: relPath,
        line: lineNo,
        message: `Declared bidirectional mirror writer "${name}" — only ensureConvexAuthOrganization (anchor mapper) is allowed. Delete this writer and consume the one-way component cache instead. See ${CONTRACT_DOC}.`,
      });
    }
  }
  return found;
}

interface DefineTableBlock {
  tableName: string;
  /** Line number (1-based) of the `<name>: defineTable(` declaration. */
  declLine: number;
  /** Body source between the opening `(` and matching `)`. */
  body: string;
  /** Line number (1-based) where the body starts (the char after `(`). */
  bodyStartLine: number;
}

function skipQuotedLiteral(source: string, index: number): number {
  const quote = source[index];
  let i = index + 1;
  while (i < source.length && source[i] !== quote) {
    if (source[i] === "\\") {
      i++;
    }
    i++;
  }
  return i;
}

function skipLineComment(source: string, index: number): number {
  let i = index;
  while (i < source.length && source[i] !== "\n") {
    i++;
  }
  return i;
}

function skipBlockComment(source: string, index: number): number {
  let i = index + 2;
  while (i < source.length && !(source[i] === "*" && source[i + 1] === "/")) {
    i++;
  }
  return i + 1;
}

function findMatchingParen(source: string, openParenIdx: number): number | null {
  let i = openParenIdx + 1;
  let depth = 1;
  while (i < source.length && depth > 0) {
    const c = source[i];
    if (c === "(") {
      depth++;
    } else if (c === ")") {
      depth--;
      if (depth === 0) {
        return i;
      }
    } else if (c === '"' || c === "'" || c === "`") {
      i = skipQuotedLiteral(source, i);
    } else if (c === "/" && source[i + 1] === "/") {
      i = skipLineComment(source, i);
    } else if (c === "/" && source[i + 1] === "*") {
      i = skipBlockComment(source, i);
    }
    i++;
  }
  return null;
}

/**
 * Walk source and extract every `<name>: defineTable( ... )` block, tracking
 * paren depth so nested calls (e.g. `v.object({...})`, `v.union(...)`) don't
 * confuse the matcher.
 */
function findDefineTableBlocks(source: string): DefineTableBlock[] {
  const blocks: DefineTableBlock[] = [];
  const re = /([A-Za-z_][A-Za-z0-9_]*)\s*:\s*defineTable\s*\(/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(source)) !== null) {
    const tableName = match[1] ?? "";
    const declStart = match.index;
    const openParenIdx = re.lastIndex - 1;
    const closeParenIdx = findMatchingParen(source, openParenIdx);
    if (closeParenIdx === null) {
      // Unbalanced — skip rather than throw; the consumer's tsc will catch it.
      re.lastIndex = openParenIdx + 1;
      continue;
    }
    const body = source.slice(openParenIdx + 1, closeParenIdx);
    const declLine = source.slice(0, declStart).split(/\r?\n/).length;
    const bodyStartLine = source.slice(0, openParenIdx + 1).split(/\r?\n/).length;
    blocks.push({ tableName, declLine, body, bodyStartLine });
    re.lastIndex = closeParenIdx + 1;
  }
  return blocks;
}

function findBridgeColumns(
  body: string,
  bodyStartLine: number,
): Array<{ name: string; line: number }> {
  const cols: Array<{ name: string; line: number }> = [];
  // `<name>: v.<...>` — convex column declarations. Property-key delimiters
  // are start-of-string, whitespace, `,`, `{`, or `(`.
  const re = /(?:^|[\s,{(])([A-Za-z_][A-Za-z0-9_]*)\s*:\s*v\./g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    const colName = m[1] ?? "";
    if (!BRIDGE_COLUMN_PATTERN.test(colName)) continue;
    const lineOffset = body.slice(0, m.index).split(/\r?\n/).length - 1;
    cols.push({ name: colName, line: bodyStartLine + lineOffset });
  }
  return cols;
}

function checkLocalBridgeMirror(
  source: string,
  relPath: string,
  anchorTables: ReadonlySet<string>,
): ConsumerContractViolation[] {
  const found: ConsumerContractViolation[] = [];
  for (const block of findDefineTableBlocks(source)) {
    if (anchorTables.has(block.tableName)) continue;
    const cols = findBridgeColumns(block.body, block.bodyStartLine);
    if (cols.length === 0) continue;
    const colSummary = cols.map((c) => c.name).join(", ");
    const anchorList = [...anchorTables]
      .toSorted()
      .map((t) => `"${t}"`)
      .join(" / ");
    found.push({
      rule: "local-bridge-mirror",
      file: relPath,
      line: block.declLine,
      message:
        `Local defineTable "${block.tableName}" has bridge column(s) [${colSummary}] — ` +
        `only the ${anchorList} anchor table(s) may carry convexAuth*Id columns. ` +
        `Drop this mirror and read from the component (or a one-way event cache) instead. ` +
        `See ${CONTRACT_DOC}.`,
    });
  }
  return found;
}

function appendLineCommentReplacement(out: string[], c: string): boolean {
  if (c === "\n") {
    out.push("\n");
    return false;
  }
  out.push(" ");
  return true;
}

function appendBlockCommentReplacement(out: string[], c: string, n: string): boolean {
  if (c === "*" && n === "/") {
    out.push("  ");
    return false;
  }
  out.push(c === "\n" ? "\n" : " ");
  return true;
}

function appendStringChar(
  out: string[],
  c: string,
  n: string,
  quote: string,
): { done: boolean; skip: number } {
  out.push(c);
  if (c === "\\") {
    out.push(n);
    return { done: false, skip: 2 };
  }
  return { done: c === quote, skip: 1 };
}

function startCommentOrString(
  out: string[],
  c: string,
  n: string,
): {
  inBlock: boolean;
  inLine: boolean;
  inString: string | null;
  skip: number;
} | null {
  if (c === "/" && n === "/") {
    out.push("  ");
    return { inBlock: false, inLine: true, inString: null, skip: 2 };
  }
  if (c === "/" && n === "*") {
    out.push("  ");
    return { inBlock: true, inLine: false, inString: null, skip: 2 };
  }
  if (c === '"' || c === "'" || c === "`") {
    out.push(c);
    return { inBlock: false, inLine: false, inString: c, skip: 1 };
  }
  return null;
}

/**
 * Strip line and block comments from source text, replacing them with spaces
 * of the same length so line numbers and column offsets are preserved.
 * Without this, the line-based rules false-positive on documentation that
 * happens to mention `ctx.db.insert("organization_members"...)` or a
 * forbidden function name — both common in module headers explaining the
 * cutover history.
 *
 * Also tracks strings/templates so `//` inside a string literal is not
 * treated as a comment start. Regex literals are out of scope (the
 * heuristic gives them up — there are no realistic schema regexes that
 * would trigger).
 */
function stripComments(source: string): string {
  const out: string[] = [];
  let i = 0;
  let inLine = false;
  let inBlock = false;
  let inString: string | null = null;
  while (i < source.length) {
    const c = source[i] ?? "";
    const n = source[i + 1] ?? "";
    if (inLine) {
      inLine = appendLineCommentReplacement(out, c);
      i++;
      continue;
    }
    if (inBlock) {
      inBlock = appendBlockCommentReplacement(out, c, n);
      if (!inBlock) {
        i += 2;
        continue;
      }
      i++;
      continue;
    }
    if (inString !== null) {
      const result = appendStringChar(out, c, n, inString);
      inString = result.done ? null : inString;
      i += result.skip;
      continue;
    }
    const started = startCommentOrString(out, c, n);
    if (started !== null) {
      inBlock = started.inBlock;
      inLine = started.inLine;
      inString = started.inString;
      i += started.skip;
      continue;
    }
    out.push(c);
    i++;
  }
  return out.join("");
}

interface ConvexFunctionBlock {
  /** Exported symbol name. */
  name: string;
  /** The constructor identifier (`query`, `permissionQuery`, `internalQuery`, …). */
  kind: string;
  /** Source of the full RHS (config object + any curried wrapper args). */
  body: string;
  /** 1-based line of the `export const <name> =` declaration. */
  declLine: number;
  /** 1-based line where the body starts. */
  bodyStartLine: number;
}

function skipWhitespace(source: string, index: number): number {
  let i = index;
  while (i < source.length && /\s/.test(source[i] ?? "")) {
    i++;
  }
  return i;
}

function findBalancedCallGroupEnd(source: string, openParenIdx: number): number | null {
  let i = openParenIdx;
  let depth = 0;
  for (; i < source.length; i++) {
    const c = source[i];
    if (c === '"' || c === "'" || c === "`") {
      i = skipQuotedLiteral(source, i);
      continue;
    }
    if (c === "(" || c === "{" || c === "[") {
      depth++;
    } else if (c === ")" || c === "}" || c === "]") {
      depth--;
      if (depth === 0) {
        return i + 1;
      }
    }
  }
  return null;
}

function findConsecutiveCallGroupsEnd(source: string, start: number): number | null {
  let i = start;
  while (source[i] === "(") {
    const groupEnd = findBalancedCallGroupEnd(source, i);
    if (groupEnd === null) {
      return null;
    }
    i = skipWhitespace(source, groupEnd);
  }
  return i;
}

/**
 * Extract every `export const <name> = <kind>(...)` Convex function definition,
 * balancing parens/braces (and skipping strings) so curried wrappers like
 * `permissionQuery("perm")({ ... })` are captured whole. Comments are already
 * stripped by the caller.
 */
function findConvexFunctionBlocks(source: string): ConvexFunctionBlock[] {
  const blocks: ConvexFunctionBlock[] = [];
  const re = /export\s+const\s+([A-Za-z0-9_]+)\s*=\s*([A-Za-z0-9_]+)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(source)) !== null) {
    const name = match[1] ?? "";
    const kind = match[2] ?? "";
    const i = skipWhitespace(source, re.lastIndex);
    // Skip whitespace to the first `(` — if it isn't a call, this isn't a
    // Convex function constructor; move on.
    if (source[i] !== "(") continue;
    const bodyStart = i;
    // Consume one or more consecutive balanced call groups `( ... )` at depth 0
    // so currying (`permissionQuery("p")( ... )`) is captured fully.
    const bodyEnd = findConsecutiveCallGroupsEnd(source, i);
    if (bodyEnd === null) {
      continue;
    }
    const body = source.slice(bodyStart, bodyEnd);
    const declLine = source.slice(0, match.index).split(/\r?\n/).length;
    const bodyStartLine = source.slice(0, bodyStart).split(/\r?\n/).length;
    blocks.push({ name, kind, body, declLine, bodyStartLine });
    re.lastIndex = bodyEnd;
  }
  return blocks;
}

/**
 * Flag a CLIENT-CALLABLE Convex function that references a system-only component
 * reader. This is the cross-tenant-read guard: the org-scoped readers are safe
 * by construction (they require an org); the system-only readers are not, so
 * they belong exclusively in `internal*` code.
 */
function checkTenantFacingSystemReader(
  source: string,
  relPath: string,
): ConsumerContractViolation[] {
  const found: ConsumerContractViolation[] = [];
  for (const block of findConvexFunctionBlocks(source)) {
    if (INTERNAL_FUNCTION_KINDS.has(block.kind)) continue;
    if (!TENANT_FACING_FUNCTION_KINDS.has(block.kind)) continue;
    for (const reader of SYSTEM_ONLY_COMPONENT_READERS) {
      const ref = new RegExp(`(?:^|[^A-Za-z0-9_])${reader}(?:[^A-Za-z0-9_]|$)`);
      if (!ref.test(block.body)) continue;
      const offset = block.body.search(ref);
      const line =
        offset >= 0
          ? block.bodyStartLine + block.body.slice(0, offset).split(/\r?\n/).length - 1
          : block.declLine;
      found.push({
        rule: "tenant-facing-system-reader",
        file: relPath,
        line,
        message:
          `Client-callable ${block.kind} "${block.name}" references the system-only ` +
          `component reader "${reader}". These readers are UNSCOPED (resolve by id ` +
          `without an org / return secrets / span tenants) — an attacker-supplied id ` +
          `flows straight into a cross-tenant read. Move this into an internal* ` +
          `function, or use the org-scoped reader (getRole/getMember/getInvitation, ` +
          `which require an org) / a list*ByOrganization query. See ${CONTRACT_DOC}.`,
      });
    }
  }
  return found;
}

export function checkConsumerContract(
  options: CheckConsumerContractOptions,
): ConsumerContractResult {
  const { convexDir, legitAnchorTables } = options;
  const anchorTables = new Set<string>(legitAnchorTables ?? DEFAULT_ANCHOR_TABLES);
  const files: string[] = [];
  walk(convexDir, convexDir, files);

  const violations: ConsumerContractViolation[] = [];

  for (const absPath of files) {
    const relPath = relative(convexDir, absPath);
    let rawSource: string;
    try {
      rawSource = readFileSync(absPath, "utf8");
    } catch {
      continue;
    }
    // Strip comments so documentation prose about forbidden patterns
    // doesn't trigger the rules. Whitespace is preserved so line/column
    // numbers in violation messages still point at the right place.
    const source = stripComments(rawSource);
    const lines = source.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i] ?? "";
      const lineNo = i + 1;
      violations.push(...checkLocalTruthTable(line, lineNo, relPath));
      violations.push(...checkLocalMirrorWrite(line, lineNo, relPath));
      violations.push(...checkBidirectionalMirrorWriter(line, lineNo, relPath));
    }
    violations.push(...checkSplitSchemaTruthTable(source, relPath));
    violations.push(...checkLocalBridgeMirror(source, relPath, anchorTables));
    violations.push(...checkTenantFacingSystemReader(source, relPath));
  }

  return { ok: violations.length === 0, violations };
}
