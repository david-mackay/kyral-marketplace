import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";

export const runtime = "nodejs";

const MESSAGE_TEMPLATE = `Sign in to Kyral Marketplace

Timestamp: {timestamp}
Nonce: {nonce}`;

export async function GET() {
  const timestamp = Math.floor(Date.now() / 1000);
  const nonce = randomBytes(16).toString("hex");
  const message = MESSAGE_TEMPLATE.replace("{timestamp}", String(timestamp)).replace(
    "{nonce}",
    nonce
  );

  return NextResponse.json({ message });
}
