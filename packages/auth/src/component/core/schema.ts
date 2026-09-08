import { defineSchema } from "convex/server";
import { auth_identities, users } from "../schema/users.js";
import {
  authAccounts,
  authMagicLinkTokens,
  authRefreshTokens,
  authSessions,
  authVerificationCodes,
  authVerifiers,
} from "../schema/native.js";
import { organizations } from "../schema/organizations.js";

export default defineSchema({
  users,
  auth_identities,
  authAccounts,
  authSessions,
  authRefreshTokens,
  authVerificationCodes,
  authVerifiers,
  authMagicLinkTokens,
  organizations,
});
