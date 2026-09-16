const path = require("path");
const dotenv = require("dotenv");

// Expo is supposed to load `.env` before `app.config.js`, but in Expo SDK 57
// with this pnpm workspace setup it can be missing at config-evaluation time.
// Load it explicitly so the mirror below is always populated.
[".env", ".env.local"].forEach((file) => {
  dotenv.config({
    path: path.join(__dirname, file),
    override: true,
  });
});

const { expo } = require("./app.json");

// Mirror EXPO_PUBLIC_* into `extra` so the values are also available at runtime
// via `expo-constants`, even when Metro's process.env inlining is not available.
const publicEnv = {
  convexUrl: process.env.EXPO_PUBLIC_CONVEX_URL,
  convexSiteUrl: process.env.EXPO_PUBLIC_CONVEX_SITE_URL,
};

// iOS associated domain for native passkeys. Must equal the rpID configured
// in convex/auth.ts (defaults to the deployment's .convex.site host).
const passkeyRpId =
  process.env.PASSKEY_RP_ID ??
  (process.env.EXPO_PUBLIC_CONVEX_SITE_URL
    ? new URL(process.env.EXPO_PUBLIC_CONVEX_SITE_URL).hostname
    : undefined);

module.exports = {
  ...expo,
  ios: {
    ...expo.ios,
    associatedDomains: passkeyRpId ? [`webcredentials:${passkeyRpId}`] : [],
  },
  plugins: ["expo-secure-store", "expo-web-browser"],
  extra: {
    ...expo.extra,
    ...publicEnv,
  },
};
