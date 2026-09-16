---
"@vortex-api/convex-auth": patch
---

Fix React Native / Expo demo styling and runtime issues.

- Force a single `react-native` version across the workspace to prevent duplicate React Native copies from breaking Uniwind.
- Add `native.ts`, `native.tsx`, `native.js`, and `native.jsx` to Metro source extensions.
- Align Expo SDK 57 dependencies and config plugins.
- Initialize Uniwind theme explicitly on mount and color-scheme changes.
- Patch Uniwind to map kebab-case CSS `accent-color` to React Native `accentColor`.
- Stop rendering the full session JWT token in the signed-in header.
