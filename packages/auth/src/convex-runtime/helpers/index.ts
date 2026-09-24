export { mergedStream, stream, streamIndexRange } from "convex-helpers/server/stream";
export {
  getAll,
  getAllOrThrow,
  getManyFrom,
  getManyVia,
  getManyViaOrThrow,
  getOneFrom,
  getOneFromOrThrow,
  getOrThrow,
} from "convex-helpers/server/relationships";
export { getPage, paginator, streamQuery } from "convex-helpers/server/pagination";

/**
 * Untrusted-input boundaries. `JSON.parse` returns `any`; casting that result is
 * the single largest source of `no-unsafe-type-assertion` across the fleet. These
 * validate a runtime value against a Convex validator instead — so the validators
 * already declared in schema.ts and in each function's `args` become the parser,
 * rather than a hand-written guard per shape.
 *
 *   const body = parse(myArgsValidator, JSON.parse(text)); // typed, no cast
 *   if (!validate(v.object({...}), value)) { ... } // type guard
 *
 * Portable: convex-helpers/validators imports only `convex/values`, never
 * `convex/server`, so this works in Convex functions, packages and Node scripts.
 *
 * Caveat from upstream: without passing `db`, `v.id(table)` is only checked as a
 * string, not as an id belonging to that table. Pass `db` when that matters.
 */
export { ValidationError, parse, validate } from "convex-helpers/validators";

/**
 * A deeply-mutable view of `T`.
 *
 * Convex derives document and argument types from validators, and `v.array(x)`
 * produces a mutable `x[]`. Domain models that declare their arrays `readonly`
 * therefore cannot be handed to a mutation that takes a whole record, even though
 * the value is serialized on the way in and the callee provably cannot reach the
 * caller's array. The incompatibility is real to the type system and meaningless
 * at runtime.
 */
export type Writable<T> = T extends readonly (infer Element)[]
  ? Writable<Element>[]
  : T extends object
    ? { -readonly [Key in keyof T]: Writable<T[Key]> }
    : T;

/**
 * Deep-copy `value` into a genuinely mutable structure.
 *
 * Use this at a Convex write boundary -- passing a `readonly` domain model to a
 * mutation that accepts a full record -- instead of asserting the array's
 * mutability at the call site.
 *
 * The copy is real, not a cast dressed up as one. `structuredClone` returns a
 * fresh structure that nothing else holds a reference to, which is what makes the
 * return type honest: the caller's `readonly` guarantee is preserved because the
 * callee never receives the caller's object at all.
 *
 * Declared as an overload rather than written with an assertion. `structuredClone`
 * is typed `<T>(value: T) => T`, so it cannot express "same shape, mutable" -- that
 * relationship lives in `Writable<T>`. An overload lets the public signature state
 * it while the implementation stays deliberately loose, so no `as` appears here or
 * at any call site.
 *
 * Only for values Convex can serialize. `structuredClone` throws on functions,
 * symbols and class instances -- the same values a Convex validator would reject,
 * so a value that survives this call is a value a mutation can accept.
 */
export function toWritable<T>(value: T): Writable<T>;
export function toWritable(value: unknown): unknown {
  return structuredClone(value);
}
