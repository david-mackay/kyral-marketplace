import { NextRequest, NextResponse } from "next/server";

import {
  getAuthenticatedUser,
  createSessionToken,
  setSessionCookie,
} from "@/server/auth/session";
import { verifySolanaAuthSignature } from "@/server/auth/verify-signature";

export const runtime = "nodejs";

export async function GET() {
  const user = await getAuthenticatedUser();
  if (!user) {
    return NextResponse.json({ authenticated: false }, { status: 200 });
  }
  return NextResponse.json({ authenticated: true, user });
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      walletAddress?: string;
      message?: string;
      signature?: string;
    };

    const { walletAddress, message, signature } = body;

    if (!walletAddress || typeof walletAddress !== "string") {
      return NextResponse.json(
        { error: "Missing walletAddress" },
        { status: 400 }
      );
    }

    if (!message || typeof message !== "string") {
      return NextResponse.json(
        { error: "Missing message" },
        { status: 400 }
      );
    }

    if (!signature || typeof signature !== "string") {
      return NextResponse.json(
        { error: "Missing signature" },
        { status: 400 }
      );
    }

    const verifiedAddress = verifySolanaAuthSignature(
      walletAddress,
      message,
      signature
    );

    if (!verifiedAddress) {
      return NextResponse.json(
        { error: "Invalid or expired signature" },
        { status: 401 }
      );
    }

    const token = createSessionToken(verifiedAddress);
    const response = NextResponse.json({
      ok: true,
      user: { id: verifiedAddress, walletAddress: verifiedAddress },
    });
    setSessionCookie(response, token);

    return response;
  } catch (error) {
    console.error("/api/auth/session POST error", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
