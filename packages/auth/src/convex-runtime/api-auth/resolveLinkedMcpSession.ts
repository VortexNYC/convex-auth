import type { ApiResolvedAuthContext } from "../coreTypes";
import { ApiAuthError } from "./errors";
import { resolveMcpSessionAuthContext, type McpSessionLike } from "./resolveMcpSessionAuthContext";
import type { ApiAuthLookupAdapter } from "./types";

export type ResolveLinkedMcpSessionArgs = {
  session: McpSessionLike | null | undefined;
  provider: string;
  issuer: string;
  buildTokenIdentifier: (subject: string, issuer: string) => string;
  adapter: Pick<ApiAuthLookupAdapter, "getUserByIdentity" | "getOrganizationAccess">;
  requestedOrganizationId?: string | null;
  organizationHintId?: string | null;
  audience?: string | null;
  resourceType?: string | null;
  resourceId?: string | null;
};

export type LinkedMcpSessionResolution = {
  provisionalContext: ApiResolvedAuthContext;
  subjectId: string;
  userId: string;
  organizationId: string | null;
  permissions: string[];
  scopes: string[];
};

export async function resolveLinkedMcpSession(
  args: ResolveLinkedMcpSessionArgs,
): Promise<LinkedMcpSessionResolution> {
  const provisionalContext = resolveMcpSessionAuthContext({
    session: args.session,
    audience: args.audience,
    resourceType: args.resourceType,
    resourceId: args.resourceId,
  });

  const principal = provisionalContext.principal;
  if (principal.kind !== "oauthClient" || principal.subjectType !== "user") {
    throw new ApiAuthError("OAUTH_SESSION_INVALID", "MCP session user is required.");
  }

  const subjectId = principal.subjectId;
  if (subjectId === null) {
    throw new ApiAuthError("OAUTH_SESSION_INVALID", "MCP session user is required.");
  }

  const linkedUser = await args.adapter.getUserByIdentity({
    provider: args.provider,
    issuer: args.issuer,
    subject: subjectId,
    tokenIdentifier: args.buildTokenIdentifier(subjectId, args.issuer),
  });
  if (linkedUser === null) {
    throw new ApiAuthError("USER_IDENTITY_NOT_LINKED", "MCP session user is not linked.");
  }

  /* Fail closed on a suspended/restricted account, mirroring the JWT bearer
   * path (resolveApiAuthContext). Without this, an MCP client could keep
   * authorizing a restricted user as long as org access + scopes still pass. */
  if (linkedUser.isRestricted) {
    throw new ApiAuthError(
      "PRINCIPAL_RESTRICTED",
      linkedUser.restrictedReason ?? "Resolved principal is restricted.",
    );
  }

  const organizationAccess = await args.adapter.getOrganizationAccess({
    userId: linkedUser.userId,
    requestedOrganizationId: args.requestedOrganizationId ?? null,
    organizationHintId: args.organizationHintId ?? linkedUser.activeOrganizationId,
  });

  return {
    provisionalContext,
    subjectId,
    userId: linkedUser.userId,
    organizationId: organizationAccess.organizationId,
    permissions: organizationAccess.permissions,
    scopes: provisionalContext.scopes,
  };
}
