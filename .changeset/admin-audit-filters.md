---
"@vortex-api/convex-auth": minor
---

Add filters to the privileged admin audit-log query and dashboard.

- `admin/audit:listAdminAudits` now supports `action`, `targetType`, `targetId`, `adminId`, `from`, and `to` filters.
- Pagination follows filtered results using `convex-helpers` `filterWith`.
- `ConvexAdminDashboard` exposes `auditsFilters` / `onAuditsFiltersChange` controls.
