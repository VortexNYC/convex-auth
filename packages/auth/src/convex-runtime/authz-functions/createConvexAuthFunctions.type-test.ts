/**
 * Compile-time proof that the factory injects a correctly-typed `ctx.viewer`
 * (a `B2BViewer`), NOT a degraded `any`. If the convex-helpers generics ever
 * regress and `viewer` collapses to `any`, the `IsAny` guard below fails to
 * compile — which is the whole point. This file is type-only (no runtime).
 */
import { defineSchema, defineTable } from "convex/server";
import {
  mutationGeneric,
  queryGeneric,
  type GenericMutationCtx,
  type GenericQueryCtx,
  type MutationBuilder,
  type QueryBuilder,
} from "convex/server";
import type { DataModelFromSchemaDefinition } from "convex/server";
import { v } from "convex/values";

import type { Id } from "../../component/_generated/dataModel";
import type { B2BGlue, B2BViewer } from "../glue/types";
import { createConvexAuthFunctions } from "./createConvexAuthFunctions";

/*
 * A throwaway local "consumer" DataModel + builders, mirroring what a real
 * consumer gets from `_generated/server`.
 */
const schema = defineSchema({
  widgets: defineTable({ name: v.string() }),
});
type DM = DataModelFromSchemaDefinition<typeof schema>;
const query: QueryBuilder<DM, "public"> = queryGeneric;
const mutation: MutationBuilder<DM, "public"> = mutationGeneric;

type LocalUser = { _id: string; convexAuthUserId?: Id<"users"> };
type LocalAnchor = {
  _id: string;
  convexAuthOrganizationId: Id<"organizations">;
};

declare const glue: B2BGlue<LocalUser, LocalAnchor>;

const {
  adminMutation,
  authedQuery,
  permissionAllMutation,
  permissionAnyQuery,
  permissionMutation,
  permissionQuery,
} = createConvexAuthFunctions({ glue, query, mutation });

/** --- Assertion helpers --------------------------------------------------- */
type IsAny<T> = 0 extends 1 & T ? true : false;
type Expect<T extends true> = T;
type Equal<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;

/** The viewer handed to handlers must be the concrete B2BViewer, never `any`. */
permissionMutation("widgets:edit")({
  args: { id: v.string() },
  handler: async (ctx, _args) => {
    type ViewerT = (typeof ctx)["viewer"];
    type _NotAny = Expect<Equal<IsAny<ViewerT>, false>>;
    type _IsViewer = Expect<Equal<ViewerT, B2BViewer<LocalUser, LocalAnchor>>>;
    /** db must still be the consumer's typed reader (DataModel preserved). */
    type _CtxIsMutation = Expect<
      Equal<typeof ctx extends GenericMutationCtx<DM> ? true : false, true>
    >;
    void ctx.viewer.convexAuthOrganizationId;
    return null;
  },
});

permissionQuery("widgets:view")({
  args: {},
  handler: async (ctx) => {
    type ViewerT = (typeof ctx)["viewer"];
    type _NotAny = Expect<Equal<IsAny<ViewerT>, false>>;
    type _CtxIsQuery = Expect<Equal<typeof ctx extends GenericQueryCtx<DM> ? true : false, true>>;
    return ctx.viewer.hasPermission("widgets:view");
  },
});

authedQuery({
  args: {},
  handler: async (ctx) => {
    type ViewerT = (typeof ctx)["viewer"];
    type _NotAny = Expect<Equal<IsAny<ViewerT>, false>>;
    return ctx.viewer.user._id;
  },
});

permissionAnyQuery(["widgets:view", "widgets:edit"])({
  args: {},
  handler: async (ctx) => {
    type ViewerT = (typeof ctx)["viewer"];
    type _NotAny = Expect<Equal<IsAny<ViewerT>, false>>;
    return ctx.viewer.hasPermission("widgets:view");
  },
});

permissionAllMutation(["widgets:view", "widgets:edit"])({
  args: {},
  handler: async (ctx) => {
    type ViewerT = (typeof ctx)["viewer"];
    type _NotAny = Expect<Equal<IsAny<ViewerT>, false>>;
    return ctx.viewer.convexAuthOrganizationId;
  },
});

adminMutation({
  args: {},
  handler: async (ctx) => {
    type ViewerT = (typeof ctx)["viewer"];
    type _NotAny = Expect<Equal<IsAny<ViewerT>, false>>;
    return ctx.viewer.membership.roleKey;
  },
});
