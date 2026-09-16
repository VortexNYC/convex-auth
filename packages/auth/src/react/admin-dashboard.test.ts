/// <reference types="vite/client" />

import assert from "node:assert/strict";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, it } from "vitest";

import { ConvexAdminDashboard } from "./admin-dashboard";

describe("ConvexAdminDashboard", () => {
  it("renders the sidebar with all four sections", () => {
    const html = renderToStaticMarkup(createElement(ConvexAdminDashboard, {}));
    assert.match(html, /Users/);
    assert.match(html, /Sessions/);
    assert.match(html, /Organisations/);
    assert.match(html, /Audit log/);
    assert.match(html, /aria-label="Admin sections"/);
  });

  it("marks the default section as active", () => {
    const html = renderToStaticMarkup(createElement(ConvexAdminDashboard, {}));
    const activePattern = /aria-current="true"[^>]*>Users/;
    assert.match(html, activePattern);
  });

  it("renders user rows and action buttons", () => {
    const html = renderToStaticMarkup(
      createElement(ConvexAdminDashboard, {
        users: [
          {
            _id: "u1",
            email: "admin@example.com",
            name: "Admin User",
            isActive: true,
          },
        ],
        onImpersonateUser: () => {},
        onBanUser: () => {},
        onRemoveUser: () => {},
      }),
    );
    assert.match(html, /Admin User/);
    assert.match(html, /admin@example.com/);
    assert.match(html, /Impersonate/);
    assert.match(html, /Ban/);
    assert.match(html, /Remove/);
  });

  it("renders session rows with revoke action", () => {
    const html = renderToStaticMarkup(
      createElement(ConvexAdminDashboard, {
        defaultSection: "sessions",
        sessions: [{ _id: "s1", sessionId: "sess-1", userId: "u1", createdAt: 0, expiresAt: 1 }],
        onRevokeSession: () => {},
      }),
    );
    assert.match(html, /sess-1/);
    assert.match(html, /Revoke/);
  });

  it("renders organisation rows", () => {
    const html = renderToStaticMarkup(
      createElement(ConvexAdminDashboard, {
        defaultSection: "organizations",
        organizations: [{ _id: "o1", name: "Vortex" }],
      }),
    );
    assert.match(html, /Vortex/);
  });

  it("renders audit rows", () => {
    const html = renderToStaticMarkup(
      createElement(ConvexAdminDashboard, {
        defaultSection: "audit",
        audits: [
          {
            _id: "a1",
            adminId: "u1",
            action: "ban",
            targetType: "user",
            targetId: "u2",
            result: "success",
            createdAt: 0,
          },
        ],
      }),
    );
    assert.match(html, /ban/);
    assert.match(html, /success/);
  });
});
