import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const dependencies = vi.hoisted(() => ({
  auth: vi.fn(),
  getDatabase: vi.fn(),
}));
vi.mock("@clerk/tanstack-react-start/server", () => ({
  auth: dependencies.auth,
}));
vi.mock("@/db/index.server", () => ({ getDatabase: dependencies.getDatabase }));

import { getAuthenticatedUserId, getSessionUserId } from "@/lib/auth.server";
import { appUsers } from "@/db/schema";

describe("request authorization", () => {
  afterEach(() => vi.unstubAllEnvs());

  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv("CLERK_SECRET_KEY", "test-secret");
    vi.stubEnv("VITE_CLERK_PUBLISHABLE_KEY", "test-public");
  });

  it("checks every route session without provisioning a database user", async () => {
    dependencies.auth.mockResolvedValueOnce({ userId: "user-a" });
    dependencies.auth.mockResolvedValueOnce({ userId: "user-b" });
    await expect(getSessionUserId()).resolves.toBe("user-a");
    await expect(getSessionUserId()).resolves.toBe("user-b");
    expect(dependencies.auth).toHaveBeenCalledTimes(2);
    expect(dependencies.getDatabase).not.toHaveBeenCalled();
  });

  it("redirects a signed-out request before touching the database", async () => {
    dependencies.auth.mockResolvedValue({ userId: null });
    await expect(getAuthenticatedUserId()).rejects.toMatchObject({
      options: { to: "/auth" },
    });
    expect(dependencies.getDatabase).not.toHaveBeenCalled();
  });

  it("redirects when authentication is not configured", async () => {
    vi.stubEnv("CLERK_SECRET_KEY", "");
    await expect(getSessionUserId()).rejects.toMatchObject({
      options: { to: "/auth" },
    });
    expect(dependencies.auth).not.toHaveBeenCalled();
    expect(dependencies.getDatabase).not.toHaveBeenCalled();
  });

  it("independently authenticates and provisions each server operation", async () => {
    const onConflictDoNothing = vi.fn().mockResolvedValue(undefined);
    const values = vi.fn(() => ({ onConflictDoNothing }));
    const insert = vi.fn(() => ({ values }));
    dependencies.getDatabase.mockReturnValue({ insert });
    dependencies.auth.mockResolvedValueOnce({ userId: "user-a" });
    dependencies.auth.mockResolvedValueOnce({ userId: "user-b" });
    await expect(getAuthenticatedUserId()).resolves.toBe("user-a");
    await expect(getAuthenticatedUserId()).resolves.toBe("user-b");
    expect(dependencies.auth).toHaveBeenCalledTimes(2);
    expect(insert).toHaveBeenCalledWith(appUsers);
    expect(values.mock.calls).toEqual([[{ id: "user-a" }], [{ id: "user-b" }]]);
    expect(onConflictDoNothing).toHaveBeenCalledTimes(2);
  });
});
