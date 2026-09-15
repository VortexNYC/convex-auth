import * as React from "react";
import ReactDOMServer from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ConvexAdminPortal } from "./admin-portal";
import type { ConvexBetterAuthClient } from "./auth-client-types";

const mockClient = {
  useSession: () => ({
    data: {
      session: { id: "s_1", token: "token-1" },
      user: {
        id: "u_1",
        email: "u_1@example.com",
        name: "Test User",
        image: null,
        emailVerified: true,
      },
    },
    isPending: false,
  }),
  listSessions: () => Promise.resolve({ error: null, data: [] }),
  updateUser: () => Promise.resolve({ error: null }),
  twoFactor: { enable: () => Promise.resolve({ error: null, data: null }) },
} as unknown as ConvexBetterAuthClient;

describe("ConvexAdminPortal", () => {
  it("renders a tabbed shell without crashing", () => {
    const html = ReactDOMServer.renderToString(
      React.createElement(ConvexAdminPortal, { authClient: mockClient }),
    );

    expect(html).toContain("Profile");
    expect(html).toContain("Sessions");
    expect(html).toContain("Security");
    expect(html).toContain("u_1@example.com");
  });

  it("renders the Workspace tab when organizations are provided", () => {
    const html = ReactDOMServer.renderToString(
      React.createElement(ConvexAdminPortal, {
        authClient: mockClient,
        organizations: [{ _id: "org_1", name: "Acme" }],
        onSelectOrganization: () => undefined,
      }),
    );

    expect(html).toContain("Workspace");
  });
});
