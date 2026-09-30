---
"@vortexnyc/auth": patch
---

fix(component): use `by_admin` index in `listAdminAudits` when `adminId` filter is set — previously scanned the whole audit table on every filtered page
