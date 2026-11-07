import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Prisma + the Anthropic SDK only ever run on the server.
  serverExternalPackages: ["@prisma/client"],
};

export default nextConfig;
