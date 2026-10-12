import { NextRequest, NextResponse } from "next/server";
import { getAddress, isAddress } from "viem";
import { createSiweMessage, generateSiweNonce } from "viem/siwe";

import { monadChain } from "@/lib/chain";
import { SIWE_NONCE_COOKIE, SIWE_TTL_SECONDS, requestOrigin } from "@/server/auth/verify-signature";

export const runtime = "nodejs";

/**
 * EIP-4361 (Sign-In with Ethereum) challenge. Wallets check `domain` against
 * the page they're on, so the message must name the host it was served from.
 */
export async function GET(req: NextRequest) {
  const address = req.nextUrl.searchParams.get("address");
  if (!address || !isAddress(address)) {
    return NextResponse.json({ error: "Missing address" }, { status: 400 });
  }

  const { host, origin } = requestOrigin(req);
  const nonce = generateSiweNonce();
  const issuedAt = new Date();
  const message = createSiweMessage({
    domain: host,
    uri: origin,
    address: getAddress(address),
    statement: "Sign in to Kyral. This doesn't send a transaction or cost anything.",
    version: "1",
    chainId: monadChain.id,
    nonce,
    issuedAt,
    expirationTime: new Date(issuedAt.getTime() + SIWE_TTL_SECONDS * 1000),
  });

  const response = NextResponse.json({ message });
  response.cookies.set(SIWE_NONCE_COOKIE, nonce, {
    httpOnly: true,
    sameSite: "strict",
    secure: origin.startsWith("https://"),
    path: "/api/auth",
    maxAge: SIWE_TTL_SECONDS,
  });
  return response;
}
