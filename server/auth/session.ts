import jwt from "jsonwebtoken";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";

import { db } from "@/server/db";
import { users } from "@/server/db/schema";

const SESSION_COOKIE_NAME = "kyral_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days

type SessionPayload = {
  sub: string;
  walletAddress: string;
  exp: number;
};

export interface AuthenticatedUser {
  id: string;
  walletAddress: string;
}

function getJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET is not set");
  }
  return secret;
}

export function createSessionToken(walletAddress: string) {
  return jwt.sign({ sub: walletAddress, walletAddress }, getJwtSecret(), {
    expiresIn: SESSION_TTL_SECONDS,
  });
}

/**
 * Get or create a user in the database based on wallet address.
 * Called lazily when we need a DB user.
 */
export async function getOrCreateUser(
  walletAddress: string
): Promise<AuthenticatedUser | null> {
  try {
    const row = await db
      .insert(users)
      .values({ walletAddress })
      .onConflictDoUpdate({
        target: users.walletAddress,
        set: { updatedAt: new Date() },
      })
      .returning()
      .then((rows) => rows[0]);

    if (row) {
      return { id: row.id, walletAddress: row.walletAddress };
    }

    const existingUser = await db.query.users.findFirst({
      where: eq(users.walletAddress, walletAddress),
    });
    return existingUser
      ? { id: existingUser.id, walletAddress: existingUser.walletAddress }
      : null;
  } catch (error) {
    console.error("Database operation failed:", error);
    return null;
  }
}

export function setSessionCookie(response: NextResponse, token: string) {
  response.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: token,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: SESSION_TTL_SECONDS,
    path: "/",
  });
}

export function clearSessionCookie(response: NextResponse) {
  response.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: "",
    expires: new Date(0),
    path: "/",
  });
}

function isSessionPayload(value: unknown): value is SessionPayload {
  if (typeof value !== "object" || value === null) return false;
  const payload = value as Record<string, unknown>;
  return (
    typeof payload.sub === "string" &&
    typeof payload.walletAddress === "string" &&
    typeof payload.exp === "number"
  );
}

export async function getAuthenticatedUser(): Promise<AuthenticatedUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;

  try {
    const decoded = jwt.verify(token, getJwtSecret());
    if (!isSessionPayload(decoded)) return null;

    return {
      id: decoded.sub,
      walletAddress: decoded.walletAddress,
    };
  } catch {
    return null;
  }
}

/**
 * Get authenticated user with DB record. Creates user lazily if needed.
 */
export async function getAuthenticatedUserWithDb(): Promise<AuthenticatedUser | null> {
  const authUser = await getAuthenticatedUser();
  if (!authUser) return null;

  const isUuid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      authUser.id
    );

  if (isUuid) {
    const user = await db.query.users.findFirst({
      where: eq(users.id, authUser.id),
    });
    return user
      ? { id: user.id, walletAddress: user.walletAddress }
      : null;
  }

  return getOrCreateUser(authUser.walletAddress);
}

export async function requireAuthenticatedUser() {
  const user = await getAuthenticatedUserWithDb();
  if (!user) {
    const authUser = await getAuthenticatedUser();
    if (!authUser) {
      throw new Error("UNAUTHENTICATED");
    }
    throw new Error("DATABASE_NOT_AVAILABLE");
  }
  return user;
}
