import { useMemo } from "react";
import type { FunctionReference } from "convex/server";

import type {
  ConvexOrganizationInviteMemberResult,
  ConvexOrganizationMemberFunctionReferences,
  ConvexOrganizationMemberListItem,
  ConvexOrganizationRoleTemplate,
} from "./organization-members";
import type {
  ConvexOrganizationCreateRoleArgs,
  ConvexOrganizationPermissionListItem,
  ConvexOrganizationRoleListItem,
  ConvexOrganizationRoleManagerFunctionReferences,
} from "./organization-roles";

type EmptyArgs = Record<string, never>;

export type ConvexOrganizationApi<
  Role extends string = ConvexOrganizationRoleTemplate,
  MemberId extends string = string,
  OrganizationId extends string = string,
  InvitationId extends string = string,
  RoleId extends string = string,
> = {
  organizations: {
    listMembers: FunctionReference<
      "query",
      "public",
      EmptyArgs,
      readonly ConvexOrganizationMemberListItem<MemberId>[]
    >;
    inviteMember: FunctionReference<
      "action",
      "public",
      { email: string; organizationId: OrganizationId; roleTemplate: Role },
      ConvexOrganizationInviteMemberResult<InvitationId>
    >;
    reactivateMember: FunctionReference<"mutation", "public", { membershipId: MemberId }, unknown>;
    setMemberRole: FunctionReference<
      "mutation",
      "public",
      { membershipId: MemberId; roleTemplate: Role },
      unknown
    >;
    suspendMember: FunctionReference<"mutation", "public", { membershipId: MemberId }, unknown>;
    listPermissions: FunctionReference<
      "query",
      "public",
      EmptyArgs,
      readonly ConvexOrganizationPermissionListItem[]
    >;
    listRoles: FunctionReference<
      "query",
      "public",
      EmptyArgs,
      readonly ConvexOrganizationRoleListItem<RoleId>[]
    >;
    createRole: FunctionReference<"mutation", "public", ConvexOrganizationCreateRoleArgs, RoleId>;
  };
};

export type ConvexOrganizationRefs<
  Role extends string = ConvexOrganizationRoleTemplate,
  MemberId extends string = string,
  OrganizationId extends string = string,
  InvitationId extends string = string,
  RoleId extends string = string,
> = {
  members: ConvexOrganizationMemberFunctionReferences<Role, MemberId, OrganizationId, InvitationId>;
  roles: ConvexOrganizationRoleManagerFunctionReferences<RoleId>;
};

export function useConvexOrganizationRefs<
  Role extends string = ConvexOrganizationRoleTemplate,
  MemberId extends string = string,
  OrganizationId extends string = string,
  InvitationId extends string = string,
  RoleId extends string = string,
>(
  api: ConvexOrganizationApi<Role, MemberId, OrganizationId, InvitationId, RoleId>,
): ConvexOrganizationRefs<Role, MemberId, OrganizationId, InvitationId, RoleId> {
  return useMemo(
    () => ({
      members: {
        listMembers: api.organizations.listMembers,
        inviteMember: api.organizations.inviteMember,
        reactivateMember: api.organizations.reactivateMember,
        setMemberRole: api.organizations.setMemberRole,
        suspendMember: api.organizations.suspendMember,
      },
      roles: {
        createRole: api.organizations.createRole,
        listPermissions: api.organizations.listPermissions,
        listRoles: api.organizations.listRoles,
      },
    }),
    [api],
  );
}
