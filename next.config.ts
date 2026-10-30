import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Ứng dụng dùng auth cookie theo request → tắt cacheComponents để dùng route segment config `dynamic`
  cacheComponents: false,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
