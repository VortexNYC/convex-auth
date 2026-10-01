// Generates props-registry.json from the React component sources so docs
// props tables can't drift from the real types. Runs before the docs build.
//
//   node scripts/generate-props-registry.mjs [--check]
//
// `--check` exits non-zero when the committed registry is stale or any MDX
// <PropsTable of="..." rows="..."> references a missing component/prop.
//
// Extraction is a direct TypeScript-API walk (not react-docgen): for every
// exported PascalCase function/const in packages/auth/src/react we take the
// first parameter's type and enumerate members declared in this repo —
// inherited DOM attributes collapse into a `(rest)` row naming the base
// type instead of dumping hundreds of lib entries.

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const siteDir = dirname(fileURLToPath(new URL(".", import.meta.url)));
const repoRoot = join(siteDir, "..");
const reactSrc = join(repoRoot, "packages/auth/src/react");
const mdxDir = join(repoRoot, "docs/components/react");
const outFile = join(siteDir, "generated/props-registry.json");

function tsxFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory()
      ? tsxFiles(join(dir, e.name))
      : e.name.endsWith(".tsx") && !e.name.endsWith(".test.tsx")
        ? [join(dir, e.name)]
        : [],
  );
}

const files = tsxFiles(reactSrc);

const configPath = join(repoRoot, "packages/auth/tsconfig.json");
const { config } = ts.readConfigFile(configPath, ts.sys.readFile);
const { options } = ts.parseJsonConfigFileContent(config, ts.sys, dirname(configPath));

const program = ts.createProgram(files, { ...options, noEmit: true });
const checker = program.getTypeChecker();

const isExternalFile = (f) =>
  f.includes("node_modules") ||
  f.includes("/lib/lib.") ||
  (f.endsWith(".d.ts") && !f.includes("/packages/"));

function isExternalType(type) {
  const decls = (type.aliasSymbol ?? type.symbol)?.declarations ?? [];
  if (decls.length === 0) return false;
  return decls.every((d) => isExternalFile(d.getSourceFile().fileName));
}

function typeText(symbol, declaration) {
  const type = checker.getTypeOfSymbolAtLocation(symbol, declaration);
  const text = checker.typeToString(
    type,
    undefined,
    ts.TypeFormatFlags.NoTruncation |
      ts.TypeFormatFlags.InTypeAlias |
      ts.TypeFormatFlags.UseAliasDefinedOutsideCurrentScope,
  );
  return text.replace(/\s+/g, " ").trim();
}

// Remove top-level `| undefined` union members without touching undefined
// nested inside function/object types (tracked by bracket depth).
function stripUndefined(text) {
  let out = "";
  let depth = 0;
  const open = "(<[{";
  const close = ")>]}";
  for (let i = 0; i < text.length; i++) {
    const rest = text.slice(i);
    if (depth === 0 && rest.startsWith("| undefined")) {
      i += "| undefined".length - 1;
      continue;
    }
    if (depth === 0 && i === 0 && rest.startsWith("undefined |")) {
      i += "undefined |".length - 1;
      continue;
    }
    const ch = text[i];
    if (open.includes(ch)) depth++;
    if (close.includes(ch)) depth--;
    out += ch;
  }
  return out.trim() || "undefined";
}

/** Destructured default values from `{ a = x }` binding patterns. */
function bindingDefaults(param) {
  const defaults = new Map();
  if (ts.isObjectBindingPattern(param.name)) {
    for (const el of param.name.elements) {
      if (el.initializer && ts.isIdentifier(el.name)) {
        defaults.set(el.name.text, el.initializer.getText());
      }
    }
  }
  return defaults;
}

// `prop ?? <literal>` fallbacks in the function body — the common pattern
// for components that take a props object rather than destructuring.
function coalesceDefaults(fnLike) {
  const defaults = new Map();
  const text = fnLike.getText();
  const re = /[.$\w]+\s*\?\?\s*("[^"\n]*"|'[^'\n]*'|true|false|null|\d+(?:\.\d+)?)/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    const key = m[0].split("??")[0].trim().split(".").pop();
    if (!defaults.has(key)) defaults.set(key, m[1]);
  }
  return defaults;
}

/** External base types (`InputHTMLAttributes<…>` etc.) shown as rest rows. */
function externalBases(param) {
  const bases = [];
  const seen = new Set();
  const addText = (text) => {
    if (!seen.has(text)) {
      seen.add(text);
      bases.push(text);
    }
  };
  const typeNode = param.type;
  const type = checker.getTypeAtLocation(param);

  // Bare reference: `props: InputHTMLAttributes<HTMLInputElement>`
  if (typeNode && ts.isTypeReferenceNode(typeNode) && isExternalType(type)) {
    addText(typeNode.getText());
    return bases;
  }

  // Intersections, inline (`{a} & X`) or aliased (`type P = {a} & X`)
  const intersectionNodes = [];
  if (typeNode && ts.isIntersectionTypeNode(typeNode)) {
    intersectionNodes.push(typeNode);
  }
  for (const decl of type.aliasSymbol?.declarations ?? []) {
    if (ts.isTypeAliasDeclaration(decl) && ts.isIntersectionTypeNode(decl.type)) {
      intersectionNodes.push(decl.type);
    }
  }
  for (const node of intersectionNodes) {
    for (const part of node.types) {
      if (!ts.isTypeLiteralNode(part)) {
        const t = checker.getTypeAtLocation(part);
        if (isExternalType(t)) addText(part.getText());
      }
    }
  }

  // Interface heritage on an interface declared in this repo
  for (const decl of type.symbol?.declarations ?? []) {
    if (ts.isInterfaceDeclaration(decl) && !isExternalFile(decl.getSourceFile().fileName)) {
      for (const clause of decl.heritageClauses ?? []) {
        for (const t of clause.types) {
          const resolved = checker.getTypeAtLocation(t.expression);
          if (isExternalType(resolved)) addText(t.getText());
        }
      }
    }
  }
  return bases;
}

function propsOfFunction(decl) {
  const params = decl.parameters ?? [];
  if (params.length === 0) return [];
  const param = params[0];
  const type = checker.getTypeAtLocation(param);
  if (!type || type.getProperties().length === 0) return [];
  const defaults = bindingDefaults(param);
  const coalesced = coalesceDefaults(decl);
  const props = type
    .getProperties()
    .filter((p) => {
      const decl = p.valueDeclaration;
      // Only props declared in this repo — keeps inherited DOM attributes
      // out of the table (they surface as a `(rest)` row instead).
      return decl !== undefined && !isExternalFile(decl.getSourceFile().fileName);
    })
    .map((p) => {
      const propDecl = p.valueDeclaration;
      const name = p.getName();
      const propType = checker.getTypeOfSymbolAtLocation(p, propDecl);
      const undefInUnion =
        propType.isUnion() && propType.types.some((u) => (u.flags & ts.TypeFlags.Undefined) !== 0);
      const optional =
        (p.flags & ts.SymbolFlags.Optional) !== 0 || defaults.has(name) || undefInUnion;
      const required = !optional;
      const docs = ts.displayPartsToString(p.getDocumentationComment(checker));
      // Prefer the written annotation (`ReactNode`, `Foo<T>`) over the
      // resolved expansion — ReactNode alone becomes a 200-char union.
      const sig = p.declarations?.find((d) => ts.isPropertySignature(d));
      const declared = sig?.type ? sig.type.getText() : null;
      let text = declared ?? typeText(p, propDecl);
      if (undefInUnion) text = stripUndefined(text);
      const entry = { name, type: text, required };
      if (docs) entry.description = docs;
      if (defaults.has(name)) {
        entry.defaultValue = defaults.get(name);
      } else if (coalesced.has(name)) {
        entry.defaultValue = coalesced.get(name);
      }
      return entry;
    });
  for (const base of externalBases(param)) {
    const entry = { name: "(rest)", type: base, required: false };
    if (/HTMLAttributes|AriaAttributes|DOMAttributes/.test(base)) {
      entry.description = "Forwarded to the underlying element.";
    }
    props.push(entry);
  }
  return props;
}

function exportedName(node) {
  const mods = ts.canHaveModifiers(node) ? ts.getModifiers(node) : undefined;
  const isExported = mods?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
  if (!isExported) return null;
  const name = ts.isVariableStatement(node)
    ? node.declarationList.declarations[0]?.name
    : node.name;
  if (!name || !ts.isIdentifier(name) || !/^[A-Z]/.test(name.text)) return null;
  return name.text;
}

const registry = {};

for (const file of files) {
  const sf = program.getSourceFile(file);
  if (!sf) continue;
  for (const stmt of sf.statements) {
    let name = null;
    let fnLike = null;
    if (ts.isFunctionDeclaration(stmt)) {
      name = exportedName(stmt);
      fnLike = stmt;
    } else if (ts.isVariableStatement(stmt)) {
      name = exportedName(stmt);
      const init = stmt.declarationList.declarations[0]?.initializer;
      if (init && (ts.isArrowFunction(init) || ts.isFunctionExpression(init))) {
        fnLike = init;
      }
    }
    if (!name || !fnLike) continue;
    const props = propsOfFunction(fnLike);
    if (!registry[name] || props.length > registry[name].length) {
      registry[name] = props;
    }
  }
}

const json = JSON.stringify(registry, null, 2) + "\n";

// Every <PropsTable of="X" rows="a,b"> in the docs must resolve — typos
// fail the build here rather than soft-warning at render time.
function validateMdxRefs() {
  const failures = [];
  const refRe = /<PropsTable\s+([^>]*)\/?>/g;
  for (const entry of readdirSync(mdxDir)) {
    if (!entry.endsWith(".mdx")) continue;
    const file = join(mdxDir, entry);
    const text = readFileSync(file, "utf8");
    let m;
    while ((m = refRe.exec(text)) !== null) {
      const of = /of="([^"]+)"/.exec(m[1])?.[1];
      const rows = /rows="([^"]+)"/.exec(m[1])?.[1];
      if (!of) {
        failures.push(`${entry}: <PropsTable> missing \`of\``);
        continue;
      }
      const props = registry[of];
      if (!props) {
        failures.push(`${entry}: no registry entry for "${of}"`);
        continue;
      }
      for (const name of (rows ?? "").split(",").map((s) => s.trim())) {
        if (name && !props.some((p) => p.name === name)) {
          failures.push(`${entry}: ${of}.${name} is not a prop`);
        }
      }
    }
  }
  return failures;
}

if (process.argv.includes("--check")) {
  const current = existsSync(outFile) ? readFileSync(outFile, "utf8") : "";
  if (current !== json) {
    console.error("[props-registry] registry is stale — run `pnpm --dir site run codegen:props`");
    process.exit(1);
  }
  const failures = validateMdxRefs();
  if (failures.length > 0) {
    for (const f of failures) console.error(`[props-registry] ${f}`);
    process.exit(1);
  }
  console.log(`[props-registry] up to date (${Object.keys(registry).length} components)`);
} else {
  mkdirSync(dirname(outFile), { recursive: true });
  writeFileSync(outFile, json);
  console.log(`[props-registry] wrote ${Object.keys(registry).length} components`);
}
