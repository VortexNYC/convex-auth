// pnpm's install-time dep-graph walk propagates `installable=false` from any
// package whose `engines.node` excludes the running Node into its entire
// subtree, silently dropping `optional: true` deps — including unrelated
// platform binaries like @rollup/rollup-linux-x64-gnu — without logging them
// as skipped. These packages declare Node >=22.12; on the Node 20 CI leg
// their presence poisons the shared subtree and rollup's native binary never
// links. Stripping `engines.node` only changes install-time installability:
// the packages still install on Node 20 (as non-optional ones already did,
// with warnings), and every package here builds/runs on Node 20.20.
const STRIP_NODE_ENGINE = new Set([
  "@tanstack/react-start",
  "@tanstack/react-start-rsc",
  "@tanstack/start-plugin-core",
  "blume",
]);
module.exports = {
  hooks: {
    readPackage(pkg) {
      if (STRIP_NODE_ENGINE.has(pkg.name) && pkg.engines?.node) {
        delete pkg.engines.node;
      }
      return pkg;
    },
  },
};
