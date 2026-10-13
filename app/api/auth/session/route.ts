import { NextRequest, NextResponse } from "next/server";

import {
  getAuthenticatedUserWithDb,
  getOrCreateUser,
  createSessionToken,
  setSessionCookie,
} from "@/server/auth/session";
import { verifyPrivyWallet } from "@/server/auth/privy";

export const runtime = "nodejs";

export async function GET() {
  const user = await getAuthenticatedUserWithDb();
  if (!user) {
    return NextResponse.json({ authenticated: false }, { status: 200 });
  }
  return NextResponse.json({ authenticated: true, user });
}

/** Exchange a Privy access token for a Kyral session bound to one of the user's wallets. */
export async function POST(req: NextRequest) {
  try {
    const { accessToken, walletAddress } = (await req.json()) as { accessToken?: unknown; walletAddress?: unknown };
    if (typeof accessToken !== "string" || typeof walletAddress !== "string") {
      return NextResponse.json({ error: "Missing accessToken or walletAddress" }, { status: 400 });
    }

    const verifiedAddress = await verifyPrivyWallet(accessToken, walletAddress);
    if (!verifiedAddress) {
      return NextResponse.json({ error: "Sign-in could not be verified" }, { status: 401 });
    }

    const dbUser = await getOrCreateUser(verifiedAddress);
    if (!dbUser) {
      return NextResponse.json({ error: "Failed to create user account" }, { status: 500 });
    }

    const response = NextResponse.json({
      ok: true,
      user: { id: dbUser.id, walletAddress: dbUser.walletAddress },
    });
    setSessionCookie(response, createSessionToken(verifiedAddress));
    return response;
  } catch (error) {
    console.error("/api/auth/session POST error", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
