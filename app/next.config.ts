import type { NextConfig } from "next";

const engineUrl =
  process.env.NEXT_PUBLIC_ENGINE_URL || "http://localhost:8004";

const nextConfig: NextConfig = {
  output: "standalone",
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${engineUrl}/:path*`,
      },
    ];
  },
};

export default nextConfig;
