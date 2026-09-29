import type { GenericActionCtx, GenericDataModel } from "convex/server";
import type { NativeEmailAndPasswordComponentHandle } from "./types.js";

export const NATIVE_CREDENTIAL_PROVIDERS = ["password", "username"] as const;
export type NativeCredentialProvider = (typeof NATIVE_CREDENTIAL_PROVIDERS)[number];

type QueryRunner = Pick<GenericActionCtx<GenericDataModel>, "runQuery">;

type NativeIdentityRow = {
  provider: string;
  subject: string;
};

type NativeAccountRow = {
  _id: string;
  credentialHash: string;
};

/**
 * The first native credential identity on the user, preferring "password"
 * then "username". An identity without an account still counts — callers
 * that need the credential itself should use `getNativeCredentialAccount`.
 */
export async function getNativeCredentialIdentity(
  ctx: QueryRunner,
  component: NativeEmailAndPasswordComponentHandle,
  userId: string,
): Promise<{ provider: NativeCredentialProvider; identity: NativeIdentityRow } | null> {
  for (const provider of NATIVE_CREDENTIAL_PROVIDERS) {
    const identity = (await ctx.runQuery(component.native.identities.getNativeIdentityByUser, {
      userId,
      provider,
      issuer: "native",
    })) as NativeIdentityRow | null;
    if (identity) {
      return { provider, identity };
    }
  }
  return null;
}

/**
 * The first native credential identity that actually has an account row —
 * an orphaned identity (e.g. a password identity whose account was never
 * created) does not shadow a working username credential.
 */
export async function getNativeCredentialAccount(
  ctx: QueryRunner,
  component: NativeEmailAndPasswordComponentHandle,
  userId: string,
): Promise<{
  provider: NativeCredentialProvider;
  identity: NativeIdentityRow;
  account: NativeAccountRow;
} | null> {
  for (const provider of NATIVE_CREDENTIAL_PROVIDERS) {
    const identity = (await ctx.runQuery(component.native.identities.getNativeIdentityByUser, {
      userId,
      provider,
      issuer: "native",
    })) as NativeIdentityRow | null;
    if (!identity) continue;
    const account = (await ctx.runQuery(component.native.accounts.getAccountBySubject, {
      provider,
      issuer: "native",
      subject: identity.subject,
    })) as NativeAccountRow | null;
    if (account) {
      return { provider, identity, account };
    }
  }
  return null;
}
