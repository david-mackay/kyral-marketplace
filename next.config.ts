import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["pg", "pino", "tweetnacl"],
};

export default nextConfig;
