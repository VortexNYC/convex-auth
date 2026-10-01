// Generates props-registry.json from the React component sources so docs
// props tables can't drift from the real types. Runs before the docs build.
//
//   node scripts/generate-props-registry.mjs [--check]
//
// `--check` exits non-zero when the committed registry is stale (CI gate).
//
// Extraction is a direct TypeScript-API walk (not react-docgen): for every
// exported PascalCase function/const in packages/auth/src/react we take the
// first parameter's type and enumerate its members — name, resolved type
// text, optionality, JSDoc description, and destructuring defaults.

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const siteDir = dirname(fileURLToPath(new URL(".", import.meta.url)));
const reactSrc = join(siteDir, "../packages/auth/src/react");
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

const configPath = join(siteDir, "../packages/auth/tsconfig.json");
const { config } = ts.readConfigFile(configPath, ts.sys.readFile);
const { options } = ts.parseJsonConfigFileContent(
  config,
  ts.sys,
  dirname(configPath),
);

const program = ts.createProgram(files, { ...options, noEmit: true });
const checker = program.getTypeChecker();

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

function propsOfFunction(decl) {
  const params = decl.parameters ?? [];
  if (params.length === 0) return [];
  const param = params[0];
  const type = checker.getTypeAtLocation(param);
  if (!type || type.getProperties().length === 0) return [];
  const defaults = bindingDefaults(param);
  return type
    .getProperties()
    .filter((p) => p.valueDeclaration !== undefined)
    .map((p) => {
      const propDecl = p.valueDeclaration;
      const optional =
        (p.flags & ts.SymbolFlags.Optional) !== 0 || defaults.has(p.getName());
      const required = !optional;
      const docs = ts.displayPartsToString(p.getDocumentationComment(checker));
      // Prefer the written annotation (`ReactNode`, `Foo<T>`) over the
      // resolved expansion — ReactNode alone becomes a 200-char union.
      const sig = p.declarations?.find((d) => ts.isPropertySignature(d));
      const declared = sig?.type ? sig.type.getText() : null;
      let type = declared ?? typeText(p, propDecl);
      if (optional) {
        type = type.replace(/\s*\|\s*undefined$/u, "").replace(/^undefined\s*\|\s*/u, "");
      }
      const entry = { name: p.getName(), type, required };
      if (docs) entry.description = docs;
      if (defaults.has(p.getName())) entry.defaultValue = defaults.get(p.getName());
      return entry;
    });
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

if (process.argv.includes("--check")) {
  const current = existsSync(outFile) ? readFileSync(outFile, "utf8") : "";
  if (current !== json) {
    console.error(
      "[props-registry] registry is stale — run `pnpm --dir site run codegen:props`",
    );
    process.exit(1);
  }
  console.log(`[props-registry] up to date (${Object.keys(registry).length} components)`);
} else {
  mkdirSync(dirname(outFile), { recursive: true });
  writeFileSync(outFile, json);
  console.log(`[props-registry] wrote ${Object.keys(registry).length} components`);
}
