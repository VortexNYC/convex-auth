---
"convex-auth": patch
---

Harden OAuth demo authorization boundaries and add repository security scanning.

- Enforce authenticated caller identity and organization membership in example Convex wrappers for organizations, sessions, API keys, service principals, webhooks, and security audit.
- Add reusable `examples/oauth/convex/authz.ts` helpers (`requireCaller`, `requireMatchingUserId`, `requireOrganizationMembership`) to prevent IDOR and privilege escalation through client-supplied user/organization IDs.
- Add `pnpm run scan:security`, Semgrep, TruffleHog, Secretlint, and a `security-audit.yml` GitHub Actions workflow.
- Document pnpm audit exceptions for unfixable transitive `image-size` advisories.
