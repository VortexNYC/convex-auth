const { withUniwindConfig } = require("uniwind/metro");
const { getDefaultConfig } = require("expo/metro-config");

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

config.resolver.sourceExts = [
  ...(config.resolver.sourceExts ?? []),
  "native.ts",
  "native.tsx",
  "native.js",
  "native.jsx",
];

module.exports = withUniwindConfig(config, {
  cssEntryFile: "./src/global.css",
  debug: true,
  inlineRem: 16,
});
