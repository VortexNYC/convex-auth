/**
 * Imported bcrypt digests are only honored at sane parameters: variants 2a/2b/2y
 * ($2x$ was a buggy PHP prefix nobody exports) and cost 4–14 — real vendor
 * exports are 10–12, while cost 31 would DoS every sign-in attempt. This is the
 * shape Clerk's dashboard CSV export emits in its `password_digest` column (and
 * what WorkOS imports hand off).
 */
const BCRYPT_REGEX = /^\$2[aby]\$(?:0[4-9]|1[0-4])\$[./A-Za-z0-9]{53}$/;

export function isBcryptHash(hash: string): boolean {
  return BCRYPT_REGEX.test(hash);
}
