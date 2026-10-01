---
"@vortex-api/convex-auth": minor
---

Narrow `ConvexOrganizationPermissionChecklist`'s `copy` prop to a new `ConvexOrganizationPermissionChecklistCopy` type (`loadingMessage`, `permissionCatalogEmptyMessage`, both optional). Previously the component required `Required<ConvexOrganizationRoleManagerCopy>` — the full 13-key role-manager contract — even though the checklist only reads two keys, so standalone use forced callers to pass strings it never rendered. Callers passing a full copy object via a variable keep working; inline literals carrying unrelated copy keys need those keys removed.
