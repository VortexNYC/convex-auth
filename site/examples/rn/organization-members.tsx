import { ConvexOrganizationMembers } from "../../../packages/auth/src/react-native/organization-members";

export default function OrganizationMembersPreview() {
  return (
    <ConvexOrganizationMembers
      members={[
        { _id: "m1", userId: "u1", name: "Ada Lovelace", email: "ada@acme.dev", roleKey: "owner" },
        {
          _id: "m2",
          userId: "u2",
          name: "Grace Hopper",
          email: "grace@acme.dev",
          roleKey: "admin",
        },
      ]}
      invitations={[{ _id: "i1", email: "new-teammate@acme.dev", roleKey: "member" }]}
      roles={[
        { key: "owner", label: "Owner" },
        { key: "admin", label: "Admin" },
        { key: "member", label: "Member" },
      ]}
      onInvite={async () => ({ ok: true, error: null })}
    />
  );
}
