import {
  createHmac,
  randomBytes,
  randomUUID,
  scrypt,
  timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";

import type { StoredUser } from "./chat-session.store.js";

export type AuthConfig = {
  sessionSecret: string;
};

export type AuthIdentity = {
  id: string;
  username: string;
};

type CookieOptions = {
  maxAgeSeconds?: number;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: "Lax" | "Strict" | "None";
};

const AUTH_COOKIE_NAME = "rksp_auth_session";
const GUEST_COOKIE_NAME = "rksp_guest_session";
const scryptAsync = promisify(scrypt);

export function resolveAuthConfig(): AuthConfig | null {
  const sessionSecret = process.env.CHAT_AUTH_SESSION_SECRET?.trim();
  return sessionSecret ? { sessionSecret } : null;
}

function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}

export function serializeCookie(name: string, value: string, options: CookieOptions = {}): string {
  const parts = [`${name}=${value}`, "Path=/"];

  if (options.httpOnly ?? true) parts.push("HttpOnly");
  parts.push(`SameSite=${options.sameSite ?? (isProduction() ? "None" : "Lax")}`);
  if (options.secure ?? isProduction()) parts.push("Secure");
  if (options.maxAgeSeconds !== undefined) parts.push(`Max-Age=${Math.trunc(options.maxAgeSeconds)}`);

  return parts.join("; ");
}

function parseCookieHeader(header: string | string[] | undefined): Map<string, string> {
  const value = Array.isArray(header) ? header[0] : header;
  const cookies = new Map<string, string>();

  for (const chunk of value?.split(";") ?? []) {
    const separatorIndex = chunk.indexOf("=");
    if (separatorIndex > 0) {
      cookies.set(chunk.slice(0, separatorIndex).trim(), chunk.slice(separatorIndex + 1).trim());
    }
  }

  return cookies;
}

function signValue(value: string, secret: string): string {
  const payload = Buffer.from(value, "utf8").toString("base64url");
  const signature = createHmac("sha256", secret).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

function verifySignedValue(token: string | undefined, secret: string): string | null {
  const dotIndex = token?.lastIndexOf(".") ?? -1;
  if (!token || dotIndex <= 0) return null;

  const payload = token.slice(0, dotIndex);
  const provided = Buffer.from(token.slice(dotIndex + 1), "base64url");
  const expected = createHmac("sha256", secret).update(payload).digest();
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) return null;

  try {
    return Buffer.from(payload, "base64url").toString("utf8");
  } catch {
    return null;
  }
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("base64url");
  const hash = await scryptAsync(password, salt, 64) as Buffer;
  return `scrypt$${salt}$${hash.toString("base64url")}`;
}

export async function verifyPassword(password: string, encodedHash: string): Promise<boolean> {
  const [algorithm, salt, encoded] = encodedHash.split("$");
  if (algorithm !== "scrypt" || !salt || !encoded) return false;

  const expected = Buffer.from(encoded, "base64url");
  const actual = await scryptAsync(password, salt, expected.length) as Buffer;
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function getAuthenticatedIdentity(
  cookieHeader: string | string[] | undefined,
  config: AuthConfig | null,
): AuthIdentity | null {
  if (!config) return null;

  const raw = verifySignedValue(parseCookieHeader(cookieHeader).get(AUTH_COOKIE_NAME), config.sessionSecret);
  if (!raw) return null;

  try {
    const identity = JSON.parse(raw) as Partial<AuthIdentity>;
    return typeof identity.id === "string" && typeof identity.username === "string"
      ? { id: identity.id, username: identity.username }
      : null;
  } catch {
    return null;
  }
}

export function buildAuthCookie(user: StoredUser, config: AuthConfig): string {
  const identity: AuthIdentity = { id: user.id, username: user.username };
  return serializeCookie(AUTH_COOKIE_NAME, signValue(JSON.stringify(identity), config.sessionSecret), {
    maxAgeSeconds: 60 * 60 * 24 * 7,
  });
}

export function clearAuthCookie(): string {
  return serializeCookie(AUTH_COOKIE_NAME, "", { maxAgeSeconds: 0 });
}

export function getOrCreateGuestSession(
  cookieHeader: string | string[] | undefined,
  config: AuthConfig | null,
): { guestId: string; cookie?: string } {
  const existing = config
    ? verifySignedValue(parseCookieHeader(cookieHeader).get(GUEST_COOKIE_NAME), config.sessionSecret)
    : null;
  if (existing) return { guestId: existing };

  const guestId = randomUUID();
  return config
    ? {
        guestId,
        cookie: serializeCookie(GUEST_COOKIE_NAME, signValue(guestId, config.sessionSecret), {
          maxAgeSeconds: 60 * 60 * 24 * 30,
        }),
      }
    : { guestId };
}

export function getGuestId(
  cookieHeader: string | string[] | undefined,
  config: AuthConfig | null,
): string | null {
  return config
    ? verifySignedValue(parseCookieHeader(cookieHeader).get(GUEST_COOKIE_NAME), config.sessionSecret)
    : null;
}
