import type { NextConfig } from "next";
import { loadEnvConfig } from "@next/env";
import { fileURLToPath } from "node:url";

const workspaceRoot = fileURLToPath(new URL("../..", import.meta.url));

loadEnvConfig(workspaceRoot);

const basePath = process.env.NEXT_PUBLIC_BASE_PATH?.trim() ?? "";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  output: "export",
  trailingSlash: true,
  basePath,
  ...(basePath ? { assetPrefix: basePath } : {}),
  allowedDevOrigins: ["localhost", "127.0.0.1", "172.16.0.1"],
};

export default nextConfig;
