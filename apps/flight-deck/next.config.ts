import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@aethertrace/core-schema', '@aethertrace/pricing-engine']
};

export default nextConfig;
