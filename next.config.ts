import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Prisma + the Anthropic SDK only ever run on the server.
  serverExternalPackages: ["@prisma/client", "@prisma/adapter-libsql", "@libsql/client", "libsql"],
};

export default nextConfig;
