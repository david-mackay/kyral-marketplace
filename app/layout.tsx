import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/context/privy";
import { Navbar } from "@/components/Navbar";
import { ActivityToasts } from "@/components/ActivityToasts";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Kyral Marketplace",
  description:
    "Upload your health data once. Kyral removes what identifies you, prices it, and gets you paid every time research uses it.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased min-h-screen`}
      >
        <div className="aurora" aria-hidden>
          <span />
        </div>
        <AuthProvider>
          <Navbar />
          <main>{children}</main>
          <ActivityToasts />
        </AuthProvider>
      </body>
    </html>
  );
}
