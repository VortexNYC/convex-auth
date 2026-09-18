import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export interface RouterAuthContext {
  auth: {
    isLoading: boolean;
    isAuthenticated: boolean;
  };
}

export const router = createRouter({
  routeTree,
  defaultPendingMinMs: 0,
  context: {
    auth: { isLoading: true, isAuthenticated: false },
  },
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
