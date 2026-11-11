import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  allowedDevOrigins: ["192.168.*.*", "10.*.*.*", "172.*.*.*", "*.local", "b050-110-226-114-128.ngrok-free.app"],
  transpilePackages: [
    "@privacyresearch/libsignal-protocol-typescript",
    "@privacyresearch/curve25519-typescript",
    "@privacyresearch/libsignal-protocol-protobuf-ts",
  ],
};

export default nextConfig;
