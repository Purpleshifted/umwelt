import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Reverse proxy NoiseCraft through Next.js so iframe is same-origin
  // This avoids cross-origin SecurityError when accessing MediaStream
  async rewrites() {
    return [
      {
        source: '/noisecraft/:path*',
        destination: 'http://localhost:4000/:path*',
      },
      {
        source: '/public/:path*',
        destination: 'http://localhost:4000/public/:path*',
      }
    ];
  },
};

export default nextConfig;
