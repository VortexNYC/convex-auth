---
"@vortex-api/convex-auth": minor
---

Upgrade the Next.js adapter's `path-to-regexp` dependency to v8. Existing consumer patterns are unaffected: the adapter translates the legacy wildcard forms (`/api/(.*)`, `/api/*`) to the v8 `{*splat}` syntax internally with identical match semantics. Native v8 patterns and `RegExp`/function matchers also work. Undocumented unnamed-group patterns like `/(a|b)/` now throw a descriptive error at construction.
