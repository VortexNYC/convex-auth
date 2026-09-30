---
"@vortexnyc/auth": patch
---

fix(runtime): map expected 2FA errors to 401/400 on HTTP routes — `Invalid two factor code`, `Invalid two factor token`, `Not enrolled`, and `Unauthorized` previously surfaced as `500 unknown` on `/api/auth/two-factor/*`
