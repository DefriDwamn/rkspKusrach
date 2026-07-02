import type { NextConfig } from "next";
import { loadEnvConfig } from "@next/env";
import { fileURLToPath } from "node:url";

const workspaceRoot = fileURLToPath(new URL("../..", import.meta.url));

loadEnvConfig(workspaceRoot, process.env.NODE_ENV !== "production", console, true);

const basePath = process.env.NEXT_PUBLIC_BASE_PATH?.trim() ?? "";
const apiUrl = process.env.NEXT_PUBLIC_API_URL?.trim();

if (!apiUrl) {
  throw new Error("NEXT_PUBLIC_API_URL is not configured");
}

const nextConfig: NextConfig = {
  reactStrictMode: true,
  output: "export",
  trailingSlash: true,
  basePath,
  ...(basePath ? { assetPrefix: basePath } : {}),
  env: {
    NEXT_PUBLIC_API_URL: apiUrl,
  },
  allowedDevOrigins: ["localhost", "127.0.0.1", "172.16.0.1"],
};

export default nextConfig;
