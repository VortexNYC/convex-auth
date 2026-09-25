// Moved to ../../ssr/state.js — this module is framework-agnostic (keyed on
// Request via WeakMap) and shared by every adapter. Re-exported so the
// ./tanstack-start/server API surface is unchanged.
export * from "../../ssr/state.js";
