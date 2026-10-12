/** @type {import('next').NextConfig} */
const nextConfig = {
  // Static-export only: no server runtime, no API routes, no server actions.
  output: 'export',
  images: { unoptimized: true },
  trailingSlash: true,
  reactStrictMode: true,
};

export default nextConfig;
