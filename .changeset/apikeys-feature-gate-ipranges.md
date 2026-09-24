---
"@vortex-api/convex-auth": patch
---

fix(component): `convex.config/apiKeys` accepts `allowedIpRanges` on `issueApiKey` and `issueServiceOwnedApiKey`

The feature-gated apiKeys component accepted `allowedIpRanges` on the `upsert*` mutations but not on `issueApiKey` / `issueServiceOwnedApiKey`, so a consumer migrating from the full `convexAuth` component silently lost IP-range support on the issuance path. Args and storage now match the monolith exactly.
