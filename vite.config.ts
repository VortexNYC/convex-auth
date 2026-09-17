import { defineConfig } from "vite-plus";

export default defineConfig({
  fmt: {
    ignorePatterns: [
      "**/dist/**",
      "**/node_modules/**",
      "**/_generated/**",
      "pnpm-lock.yaml",
      "**/uniwind-types.d.ts",
    ],
  },
  lint: {
    ignorePatterns: ["**/dist/**", "**/node_modules/**", "**/_generated/**"],
    jsPlugins: ["@convex-dev/eslint-plugin"],
    overrides: [
      {
        files: ["**/convex/**/*.ts", "**/src/component/**/*.ts", "**/src/convex-runtime/**/*.ts"],
        rules: {
          "@convex-dev/no-old-registered-function-syntax": "error",
          "@convex-dev/require-args-validator": "error",
          "@convex-dev/no-filter-in-query": "error",
          "@convex-dev/no-collect-in-query": "error",
          "@convex-dev/no-top-of-hour-crons": "warn",
          "@convex-dev/no-schema-import-cycle": "error",
        },
      },
      {
        files: ["**/*.test.ts"],
        rules: {
          "@convex-dev/no-top-of-hour-crons": "off",
        },
      },
    ],
  },
});
