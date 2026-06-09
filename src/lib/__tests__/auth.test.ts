// @vitest-environment node
import { test, expect, vi, beforeEach } from "vitest";
import { jwtVerify } from "jose";

const mockSet = vi.hoisted(() => vi.fn());

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({
  cookies: () => Promise.resolve({ set: mockSet }),
}));

import { createSession } from "@/lib/auth";

const JWT_SECRET = new TextEncoder().encode("development-secret-key");

beforeEach(() => {
  mockSet.mockClear();
});

test("createSession sets an http-only auth-token cookie", async () => {
  await createSession("user-1", "test@example.com");

  expect(mockSet).toHaveBeenCalledOnce();
  const [name, , options] = mockSet.mock.calls[0];
  expect(name).toBe("auth-token");
  expect(options.httpOnly).toBe(true);
  expect(options.sameSite).toBe("lax");
  expect(options.path).toBe("/");
  expect(options.secure).toBe(false); // NODE_ENV is "test", not "production"
});

test("createSession stores userId and email in the JWT", async () => {
  await createSession("user-1", "test@example.com");

  const token = mockSet.mock.calls[0][1];
  const { payload } = await jwtVerify(token, JWT_SECRET);
  expect(payload.userId).toBe("user-1");
  expect(payload.email).toBe("test@example.com");
});

test("createSession JWT expires in 7 days", async () => {
  const before = Date.now();
  await createSession("user-1", "test@example.com");
  const after = Date.now();

  const token = mockSet.mock.calls[0][1];
  const { payload } = await jwtVerify(token, JWT_SECRET);
  const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;

  expect(payload.exp! * 1000).toBeGreaterThanOrEqual(before + sevenDaysMs - 1000);
  expect(payload.exp! * 1000).toBeLessThanOrEqual(after + sevenDaysMs + 1000);
});

test("createSession cookie expiry matches the 7-day window", async () => {
  const before = Date.now();
  await createSession("user-1", "test@example.com");
  const after = Date.now();

  const options = mockSet.mock.calls[0][2];
  const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;

  expect(options.expires.getTime()).toBeGreaterThanOrEqual(before + sevenDaysMs - 1000);
  expect(options.expires.getTime()).toBeLessThanOrEqual(after + sevenDaysMs + 1000);
});
