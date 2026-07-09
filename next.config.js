/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Single-tenant personal app. No image optimization service needed.
  images: { unoptimized: true },
};

module.exports = nextConfig;
