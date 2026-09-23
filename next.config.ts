import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    root: path.resolve(process.cwd()),
    // Base Account's SDK pulls optional Coinbase packages. We don't offer that
    // wallet, so the import resolves to a stub and the rest of RainbowKit can build.
    resolveAlias: {
      "@base-org/account": "./src/lib/optional-module-stub.ts",
    },
  },
  serverExternalPackages: [
    "@prisma/client",
    "prisma",
    "@polymarket/clob-client-v2",
    "viem",
  ],
  agentRules: false,
  images: {
    // Next's optimizer fetches remotes server-side. On NAT64 networks (Jio and
    // similar) S3 resolves to 64:ff9b::… which Next treats as a private IP and
    // refuses. Serve the original URL instead of proxying it.
    unoptimized: true,
    remotePatterns: [
      {
        protocol: "https",
        hostname: "polymarket-upload.s3.us-east-2.amazonaws.com",
      },
    ],
  },
};

export default nextConfig;
