/**
 * Compile-time proof that `Writable<T>` strips `readonly` all the way down, and
 * that `toWritable` produces a value a Convex mutation will actually accept.
 *
 * The runtime tests can only observe that the copy is independent. They cannot see
 * the thing this helper exists for: a deeply-`readonly` domain model failing to
 * satisfy a validator-derived argument type. That failure is a type error, so the
 * proof has to be a type test. If `Writable` ever regresses to a shallow strip, the
 * nested assignment below stops compiling — which is the point. Type-only, no runtime.
 */
import { defineSchema, defineTable } from "convex/server";
import type { DataModelFromSchemaDefinition, DocumentByName } from "convex/server";
import type { WithoutSystemFields } from "convex/server";
import { v } from "convex/values";

import type { Writable } from "./index";
import { toWritable } from "./index";

const schema = defineSchema({
  merchants: defineTable({
    id: v.string(),
    processorAccountRefs: v.array(v.object({ provider: v.string(), objectId: v.string() })),
    associatedIdentities: v.array(v.object({ identityRoles: v.array(v.string()) })),
  }),
});

type DataModel = DataModelFromSchemaDefinition<typeof schema>;
type MerchantDoc = DocumentByName<DataModel, "merchants">;

/** What a mutation taking a whole record accepts — mutable, per validator derivation. */
type MerchantWrite = WithoutSystemFields<MerchantDoc>;

/** What the domain layer hands over — readonly, including the nested array. */
type MerchantDomain = {
  readonly id: string;
  readonly processorAccountRefs: readonly {
    readonly provider: string;
    readonly objectId: string;
  }[];
  readonly associatedIdentities: readonly {
    readonly identityRoles: readonly string[];
  }[];
};

declare const domain: MerchantDomain;

/**
 * The failure this helper ends: the domain model is not assignable to the write
 * type. Uncommenting this is a compile error, which is why the helper exists.
 * const rejected: MerchantWrite = domain;
 */

/** The helper closes the gap — including the array nested inside an array element. */
const accepted: MerchantWrite = toWritable(domain);
void accepted;

/** `Writable` must strip nested `readonly`, not merely the outermost one. */
const nested: Writable<MerchantDomain> = toWritable(domain);
nested.processorAccountRefs.push({ provider: "payrix", objectId: "MU2" });
nested.associatedIdentities[0]?.identityRoles.push("beneficial_owner");

/** Primitives pass through unchanged rather than becoming mapped objects. */
const primitive: Writable<string> = "unchanged";
void primitive;
