import { NextRequest, NextResponse } from "next/server";

export function proxy(req: NextRequest) {
  const url = req.nextUrl.clone();
  url.pathname = "/";
  url.search = "";
  url.hash = "waitlist";

  return NextResponse.redirect(url);
}

export const config = {
  matcher: [
    "/auth/:path*",
    "/dashboard/:path*",
    "/datasets/:path*",
    "/earnings/:path*",
    "/marketplace/:path*",
    "/purchases/:path*",
    "/upload/:path*",
  ],
};
