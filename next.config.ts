import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // dev only: let a phone on the home Wi-Fi load the dev server's scripts
  // (Next 16 blocks dev assets for any host but localhost by default)
  allowedDevOrigins: ["192.168.*.*"],
};

export default nextConfig;
