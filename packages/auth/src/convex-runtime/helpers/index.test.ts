import assert from "node:assert/strict";

import { getPage, paginator, streamQuery } from "convex-helpers/server/pagination";
import {
  getAll,
  getAllOrThrow,
  getManyFrom,
  getManyVia,
  getManyViaOrThrow,
  getOneFrom,
  getOneFromOrThrow,
  getOrThrow,
} from "convex-helpers/server/relationships";
import { mergedStream, stream, streamIndexRange } from "convex-helpers/server/stream";
import { ValidationError, parse, validate } from "convex-helpers/validators";
import { v } from "convex/values";
import { describe, it } from "vitest";

import * as helpers from "./index";

describe("@vortex-api/convex-auth/convex/helpers", () => {
  it("re-exports the sanctioned convex-helpers server primitives", () => {
    assert.deepEqual(Object.keys(helpers).toSorted(), [
      "ValidationError",
      "getAll",
      "getAllOrThrow",
      "getManyFrom",
      "getManyVia",
      "getManyViaOrThrow",
      "getOneFrom",
      "getOneFromOrThrow",
      "getOrThrow",
      "getPage",
      "mergedStream",
      "paginator",
      "parse",
      "stream",
      "streamIndexRange",
      "streamQuery",
      "toWritable",
      "validate",
    ]);
    assert.strictEqual(helpers.getAll, getAll);
    assert.strictEqual(helpers.getAllOrThrow, getAllOrThrow);
    assert.strictEqual(helpers.getManyFrom, getManyFrom);
    assert.strictEqual(helpers.getManyVia, getManyVia);
    assert.strictEqual(helpers.getManyViaOrThrow, getManyViaOrThrow);
    assert.strictEqual(helpers.getOneFrom, getOneFrom);
    assert.strictEqual(helpers.getOneFromOrThrow, getOneFromOrThrow);
    assert.strictEqual(helpers.getOrThrow, getOrThrow);
    assert.strictEqual(helpers.getPage, getPage);
    assert.strictEqual(helpers.mergedStream, mergedStream);
    assert.strictEqual(helpers.paginator, paginator);
    assert.strictEqual(helpers.stream, stream);
    assert.strictEqual(helpers.streamIndexRange, streamIndexRange);
    assert.strictEqual(helpers.streamQuery, streamQuery);
    assert.strictEqual(helpers.parse, parse);
    assert.strictEqual(helpers.validate, validate);
    assert.strictEqual(helpers.ValidationError, ValidationError);
  });

  it("parses an untrusted JSON payload against a validator without a cast", () => {
    const validator = v.object({
      invoiceId: v.string(),
      amount: v.number(),
      currency: v.union(v.literal("USD"), v.literal("CAD")),
    });

    // The shape a wire boundary actually deals with: JSON.parse returns `any`.
    const parsed: unknown = JSON.parse('{"invoiceId":"inv_1","amount":1250,"currency":"USD"}');
    const body = helpers.parse(validator, parsed);
    assert.strictEqual(body.invoiceId, "inv_1");
    assert.strictEqual(body.amount, 1250);
    assert.strictEqual(body.currency, "USD");
  });

  it("rejects a payload that does not match, instead of silently passing it through", () => {
    const validator = v.object({ amount: v.number() });
    assert.strictEqual(helpers.validate(validator, { amount: "1250" }), false);
    assert.throws(() => helpers.parse(validator, { amount: "1250" }));
  });
});

describe("toWritable", () => {
  it("returns a structure the caller's value does not share", () => {
    // The point of the helper. If it were an assertion rather than a copy, the
    // mutation would receive the caller's own array and could write through it,
    // which is exactly what the `readonly` on the domain model forbids.
    const source: {
      readonly id: string;
      readonly processorAccountRefs: readonly {
        readonly provider: string;
        readonly objectId: string;
      }[];
    } = {
      id: "mer_1",
      processorAccountRefs: [{ provider: "finix", objectId: "MU1" }],
    };

    const writable = helpers.toWritable(source);
    writable.processorAccountRefs.push({ provider: "payrix", objectId: "MU2" });

    assert.strictEqual(source.processorAccountRefs.length, 1);
    assert.strictEqual(writable.processorAccountRefs.length, 2);
    assert.notStrictEqual(writable.processorAccountRefs, source.processorAccountRefs);
  });

  it("copies nested arrays, not just the outermost one", () => {
    // A shallow spread fixes the top level and leaves the nesting readonly, which
    // is the failure this helper exists to end.
    const source: {
      readonly associatedIdentities: readonly {
        readonly identityRoles: readonly string[];
      }[];
    } = {
      associatedIdentities: [{ identityRoles: ["control_person"] }],
    };

    const writable = helpers.toWritable(source);
    writable.associatedIdentities[0]?.identityRoles.push("beneficial_owner");

    assert.strictEqual(source.associatedIdentities[0]?.identityRoles.length, 1);
    assert.strictEqual(writable.associatedIdentities[0]?.identityRoles.length, 2);
  });

  it("preserves the values themselves", () => {
    const source = {
      amount: 1250,
      currency: "USD",
      metadata: { note: "partial" },
      refs: [{ recordedAt: "2026-07-28T00:00:00.000Z" }],
    } as const;
    assert.deepStrictEqual(helpers.toWritable(source), source);
  });

  it("rejects values Convex could not store anyway", () => {
    // structuredClone throws on functions -- the same values a validator rejects,
    // so anything that survives this call is something a mutation can accept.
    assert.throws(() => helpers.toWritable({ handler: () => undefined }));
  });
});
