---
"@vortex-api/convex-auth": minor
---

Drop the `familyId`-less `legacySession` fallback in `revokeSessionFamily`: sessions minted before `familyId` threading (v2.4.1) have expired under the refresh TTL, so family revocation now consults only `by_family`/`by_session` indexes. Sessions without `familyId` are no longer patched by family revocation.
