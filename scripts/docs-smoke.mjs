import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

const root = new URL("..", import.meta.url).pathname;

const docsFiles = readdirSync(new URL("../docs", import.meta.url), {
  recursive: true,
})
  .map((p) => join(root, "docs", p))
  .filter((p) => p.endsWith(".md") || p.endsWith(".mdx"));

docsFiles.push(join(root, "README.md"));

const bad = [];
const re = /(?<!\/)(?<!@vortex-api\/)convex-auth\/[a-z-./0-9_]+/g;

for (const file of docsFiles) {
  const text = readFileSync(file, "utf-8");
  const matches = text.match(re);
  if (matches) {
    bad.push({ file: relative(root, file), matches });
  }
}

if (bad.length > 0) {
  console.error("Found unscoped convex-auth package references:");
  for (const { file, matches } of bad) {
    console.error(`  ${file}: ${[...new Set(matches)].join(", ")}`);
  }
  process.exit(1);
}

console.log("Docs smoke check passed.");
