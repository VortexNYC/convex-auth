---
"@vortex-api/convex-auth": minor
---

Add user search and a detail side panel to `ConvexAdminDashboard`.

- Search users by name or email through the `usersSearch` / `onUsersSearchChange` props.
- Open a user detail sheet with `onViewUser` and `selectedUser`.
- Display role badges, ban status and creation metadata in the side panel.
- Forward search, filters and sorting from the consumer query to the component.
