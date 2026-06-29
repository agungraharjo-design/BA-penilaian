/** @type {import('next').NextConfig} */
const nextConfig = {
  images: { unoptimized: true },
  serverComponentsExternalPackages: ['playwright-core', '@sparticuz/chromium'],
  webpack: (config, { isServer }) => {
    if (isServer) {
      config.externals = [...(config.externals || []), 'playwright-core', '@sparticuz/chromium']
    }
    return config
  },
}
module.exports = nextConfig
