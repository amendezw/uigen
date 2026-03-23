// @vitest-environment node
import { test, expect, vi, beforeEach } from "vitest";
import { SignJWT } from "jose";

// Must mock before importing auth
vi.mock("server-only", () => ({}));

const cookieStore = {
  store: new Map<string, string>(),
  get: vi.fn((name: string) => {
    const value = cookieStore.store.get(name);
    return value ? { value } : undefined;
  }),
  set: vi.fn((name: string, value: string) => {
    cookieStore.store.set(name, value);
  }),
  delete: vi.fn((name: string) => {
    cookieStore.store.delete(name);
  }),
};

vi.mock("next/headers", () => ({
  cookies: vi.fn(() => Promise.resolve(cookieStore)),
}));

// Import after mocks are set up
const { createSession, getSession, deleteSession, verifySession } =
  await import("@/lib/auth");

const JWT_SECRET = new TextEncoder().encode("development-secret-key");

beforeEach(() => {
  cookieStore.store.clear();
  vi.clearAllMocks();
});

// --- createSession ---

test("createSession sets an httpOnly cookie with a JWT", async () => {
  await createSession("user-1", "user@example.com");

  expect(cookieStore.set).toHaveBeenCalledOnce();
  const [name, token, options] = cookieStore.set.mock.calls[0];
  expect(name).toBe("auth-token");
  expect(typeof token).toBe("string");
  expect(token.split(".")).toHaveLength(3); // valid JWT format
  expect(options.httpOnly).toBe(true);
  expect(options.path).toBe("/");
});

test("createSession JWT contains userId and email", async () => {
  await createSession("user-42", "test@example.com");

  const token = cookieStore.set.mock.calls[0][1] as string;
  const { jwtVerify } = await import("jose");
  const { payload } = await jwtVerify(token, JWT_SECRET);

  expect(payload.userId).toBe("user-42");
  expect(payload.email).toBe("test@example.com");
});

// --- getSession ---

test("getSession returns null when no cookie is present", async () => {
  const session = await getSession();
  expect(session).toBeNull();
});

test("getSession returns session payload for a valid token", async () => {
  const token = await new SignJWT({ userId: "user-1", email: "a@b.com" })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("7d")
    .setIssuedAt()
    .sign(JWT_SECRET);

  cookieStore.store.set("auth-token", token);

  const session = await getSession();
  expect(session).not.toBeNull();
  expect(session?.userId).toBe("user-1");
  expect(session?.email).toBe("a@b.com");
});

test("getSession returns null for an expired token", async () => {
  const token = await new SignJWT({ userId: "user-1", email: "a@b.com" })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("-1s") // already expired
    .setIssuedAt()
    .sign(JWT_SECRET);

  cookieStore.store.set("auth-token", token);

  const session = await getSession();
  expect(session).toBeNull();
});

test("getSession returns null for a tampered token", async () => {
  cookieStore.store.set("auth-token", "invalid.token.value");

  const session = await getSession();
  expect(session).toBeNull();
});

// --- deleteSession ---

test("deleteSession removes the auth cookie", async () => {
  cookieStore.store.set("auth-token", "some-token");

  await deleteSession();

  expect(cookieStore.delete).toHaveBeenCalledWith("auth-token");
});

// --- verifySession ---

function makeMockRequest(token?: string) {
  return {
    cookies: {
      get: (name: string) => (token && name === "auth-token" ? { value: token } : undefined),
    },
  } as any;
}

test("verifySession returns null when request has no cookie", async () => {
  const req = makeMockRequest();
  const session = await verifySession(req);
  expect(session).toBeNull();
});

test("verifySession returns session payload for a valid token", async () => {
  const token = await new SignJWT({ userId: "user-99", email: "x@y.com" })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("7d")
    .setIssuedAt()
    .sign(JWT_SECRET);

  const req = makeMockRequest(token);
  const session = await verifySession(req);

  expect(session?.userId).toBe("user-99");
  expect(session?.email).toBe("x@y.com");
});

test("verifySession returns null for an expired token", async () => {
  const token = await new SignJWT({ userId: "user-1", email: "a@b.com" })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("-1s")
    .setIssuedAt()
    .sign(JWT_SECRET);

  const req = makeMockRequest(token);
  const session = await verifySession(req);
  expect(session).toBeNull();
});

test("verifySession returns null for a tampered token", async () => {
  const req = makeMockRequest("bad.token.here");
  const session = await verifySession(req);
  expect(session).toBeNull();
});
