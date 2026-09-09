---
"convex-auth": patch
---

Fix OAuth callback error URL fallback to use the originating callbackURL when no explicit errorURL is provided, instead of falling back to an unhelpful `http://localhost/`.
