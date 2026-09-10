import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";

const exceptions = readFileSync("pnpm-audit-exceptions", "utf8")
  .split("\n")
  .map((line) => line.trim())
  .filter((line) => line && !line.startsWith("#"));

const args = ["pnpm", "audit", "--audit-level=high"];
for (const id of exceptions) {
  args.push("--ignore", id);
}

execSync(args.join(" "), { stdio: "inherit" });
