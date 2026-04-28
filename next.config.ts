import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**.zillowstatic.com" },
      { protocol: "https", hostname: "**.zillow.com" },
      { protocol: "https", hostname: "**.apartments.com" },
      { protocol: "https", hostname: "images1.apartments.com" },
      { protocol: "https", hostname: "**.cstatic-images.com" },
    ],
  },
};

export default nextConfig;
