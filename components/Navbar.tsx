"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { useWalletAuth } from "@/hooks/useWalletAuth";

const publicLinks = [
  { href: "/requests", label: "Requests" },
  { href: "/marketplace", label: "Marketplace" },
];

const memberLinks = [
  { href: "/earn", label: "Earn" },
  { href: "/my-data", label: "My data" },
  ...publicLinks,
  { href: "/purchases", label: "Library" },
];

export function Navbar() {
  const pathname = usePathname();
  const { isAuthenticated, user, email, logout } = useWalletAuth();
  const [menuOpen, setMenuOpen] = useState(false);

  const links = isAuthenticated ? memberLinks : publicLinks;
  const accountLabel =
    email ?? (user ? `Account ${user.walletAddress.slice(-4).toUpperCase()}` : "Account");

  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  return (
    <nav className="sticky top-0 z-50 px-3 sm:px-6 pt-3">
      <div className="glass-strong mx-auto max-w-6xl flex h-14 items-center justify-between gap-3 px-3 sm:px-4">
        <Link href="/" className="flex items-center gap-2 shrink-0 pl-1">
          <div className="h-7 w-7 rounded-full bg-gradient-to-br from-emerald-300 via-emerald-500 to-sky-500 shadow-[inset_0_1px_0_rgba(255,255,255,0.6)]" />
          <span className="text-[15px] font-semibold tracking-tight text-zinc-50">Kyral</span>
        </Link>

        <div className="hidden md:flex items-center gap-1">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={[
                "px-3.5 py-1.5 rounded-full text-sm transition-colors",
                isActive(link.href)
                  ? "bg-white/10 text-zinc-50 shadow-[inset_0_1px_0_rgba(255,255,255,0.15)]"
                  : "text-zinc-400 hover:text-zinc-100",
              ].join(" ")}
            >
              {link.label}
            </Link>
          ))}
        </div>

        <div className="flex items-center gap-2">
          {isAuthenticated ? (
            <>
              <Link href="/upload" className="btn-liquid btn-sm">
                Add data
              </Link>
              <div className="relative">
                <button
                  onClick={() => setMenuOpen((o) => !o)}
                  className="btn-ghost btn-sm max-w-[180px]"
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shrink-0" />
                  <span className="truncate">{accountLabel}</span>
                </button>
                {menuOpen && (
                  <div
                    className="glass-strong absolute right-0 mt-2 w-48 p-1.5 text-sm"
                    onMouseLeave={() => setMenuOpen(false)}
                  >
                    <Link href="/earn" className="block rounded-xl px-3 py-2 text-zinc-300 hover:bg-white/5" onClick={() => setMenuOpen(false)}>
                      Earnings & privacy
                    </Link>
                    <Link href="/requests/new" className="block rounded-xl px-3 py-2 text-zinc-300 hover:bg-white/5" onClick={() => setMenuOpen(false)}>
                      Post a data request
                    </Link>
                    <button
                      onClick={() => void logout()}
                      className="w-full text-left rounded-xl px-3 py-2 text-zinc-500 hover:bg-white/5 hover:text-zinc-300"
                    >
                      Sign out
                    </button>
                  </div>
                )}
              </div>
            </>
          ) : (
            pathname !== "/auth" && (
              <Link href="/auth" className="btn-liquid btn-sm">
                Sign in
              </Link>
            )
          )}
        </div>
      </div>

      <div className="md:hidden mx-auto max-w-6xl mt-2 flex gap-1 overflow-x-auto px-1">
        {links.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className={[
              "glass-pill px-3 py-1 text-xs whitespace-nowrap",
              isActive(link.href) ? "text-zinc-50" : "text-zinc-400",
            ].join(" ")}
          >
            {link.label}
          </Link>
        ))}
      </div>
    </nav>
  );
}
