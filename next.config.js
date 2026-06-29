/** @type {import('next').NextConfig} */
const nextConfig = {
  images: { unoptimized: true },
  webpack: (config, { isServer }) => {
    if (isServer) {
      config.externals = [...(config.externals || []), 'playwright', 'playwright-core']
    }
    return config
  },
}
module.exports = nextConfig
