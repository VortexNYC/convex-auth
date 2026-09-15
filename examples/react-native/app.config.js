const { expo } = require("./app.json");

// Expo evaluates app.config.js in the same process as `expo start`/`expo build`,
// after it has loaded `.env`, `.env.local`, `.env.development`, and friends into
// `process.env`. This mirrors `EXPO_PUBLIC_*` into `extra` so the value is also
// available at runtime via `expo-constants` if Metro/Babel inlining ever drops it.
const publicEnv = {
  convexUrl: process.env.EXPO_PUBLIC_CONVEX_URL,
  convexSiteUrl: process.env.EXPO_PUBLIC_CONVEX_SITE_URL,
};

module.exports = {
  ...expo,
  extra: {
    ...expo.extra,
    ...publicEnv,
  },
};
