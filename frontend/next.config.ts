import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: { remotePatterns: [{ protocol: "https", hostname: "images.unsplash.com" }, { protocol: "https", hostname: "res.cloudinary.com" }] },
  async rewrites() {
    const apiOrigin = process.env.FARMRENT_API_ORIGIN ?? "http://127.0.0.1:4000";
    return [{ source: "/api/v1/:path*", destination: `${apiOrigin}/api/v1/:path*` }];
  },
};

export default nextConfig;
