// @vitest-environment jsdom

import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import { ConvexAdminDashboard } from "./admin-dashboard";

afterEach(cleanup);

const baseUser = {
  _id: "u1",
  email: "admin@example.com",
  name: "Admin User",
  isActive: true,
};

const baseSession = {
  _id: "s1",
  sessionId: "sess-1",
  userId: "u1",
  createdAt: 0,
  expiresAt: 1,
};

const baseOrganization = {
  _id: "o1",
  name: "Vortex",
  slug: "vortex",
};

const baseAudit = {
  _id: "a1",
  adminId: "u1",
  action: "ban",
  targetType: "user",
  targetId: "u2",
  result: "success",
  createdAt: 0,
};

describe("ConvexAdminDashboard interactions", () => {
  it("switches active section when a sidebar button is clicked", () => {
    render(
      createElement(ConvexAdminDashboard, {
        users: [baseUser],
        sessions: [baseSession],
        organizations: [baseOrganization],
        audits: [baseAudit],
      }),
    );

    expect(screen.queryByText("sess-1")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Sessions" }));

    expect(screen.queryByText("sess-1")).not.toBeNull();
    expect(screen.queryByText("Admin User")).toBeNull();
  });

  it("calls onBanUser with the user id and a 24h ban window", () => {
    const onBanUser = vi.fn();
    render(
      createElement(ConvexAdminDashboard, {
        users: [baseUser],
        onBanUser,
        onImpersonateUser: () => {},
        onRemoveUser: () => {},
      }),
    );

    fireEvent.click(screen.getByRole("button", { name: "Ban" }));

    expect(onBanUser).toHaveBeenCalledWith("u1", "", expect.any(Number));
  });

  it("calls onUnbanUser when an unban button is rendered", () => {
    const onUnbanUser = vi.fn();
    render(
      createElement(ConvexAdminDashboard, {
        users: [{ ...baseUser, bannedUntil: Date.now() + 1000 }],
        onUnbanUser,
      }),
    );

    fireEvent.click(screen.getByRole("button", { name: "Unban" }));

    expect(onUnbanUser).toHaveBeenCalledWith("u1");
  });

  it("calls onRemoveUser with the user id", () => {
    const onRemoveUser = vi.fn();
    render(
      createElement(ConvexAdminDashboard, {
        users: [baseUser],
        onImpersonateUser: () => {},
        onRemoveUser,
      }),
    );

    fireEvent.click(screen.getByRole("button", { name: "Remove" }));

    expect(onRemoveUser).toHaveBeenCalledWith("u1");
  });

  it("calls onRevokeSession with the session id", () => {
    const onRevokeSession = vi.fn();
    render(
      createElement(ConvexAdminDashboard, {
        defaultSection: "sessions",
        sessions: [baseSession],
        onRevokeSession,
      }),
    );

    fireEvent.click(screen.getByRole("button", { name: "Revoke" }));

    expect(onRevokeSession).toHaveBeenCalledWith("sess-1");
  });

  it("calls loadMore when the users load-more button is clicked", () => {
    const loadMore = vi.fn();
    render(
      createElement(ConvexAdminDashboard, {
        users: [baseUser],
        usersPagination: { canLoadMore: true, isLoading: false, loadMore },
      }),
    );

    fireEvent.click(screen.getByRole("button", { name: "Load more" }));

    expect(loadMore).toHaveBeenCalledWith(20);
  });

  it("does not render action buttons when their callbacks are absent", () => {
    render(createElement(ConvexAdminDashboard, { users: [baseUser] }));

    expect(screen.queryByRole("button", { name: "Ban" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Remove" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Impersonate" })).toBeNull();
  });
});
