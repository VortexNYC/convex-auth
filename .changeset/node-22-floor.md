---
"@vortex-api/convex-auth": minor
---

Declare `engines.node >=22` and drop Node 20 from the tested matrix.

Node 20 reached end-of-life in April 2026 and no longer receives security fixes. The library's Node-touching surface (server-side helpers used inside Next.js handlers, TanStack server functions, and SSR glue) is now tested on Node 22 and Node 24 only. Consumers on Node 20 will see an install-time `engines` warning rather than a silent unsupported environment; the deployed component code is unaffected — it runs in the Convex V8 isolate, which is not Node at all.
