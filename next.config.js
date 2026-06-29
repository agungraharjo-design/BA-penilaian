/** @type {import('next').NextConfig} */
const nextConfig = {
  images: { unoptimized: true },
  serverComponentsExternalPackages: ['@sparticuz/chromium'],
  webpack: (config, { isServer }) => {
    if (isServer) {
      config.externals = [...(config.externals || []), '@sparticuz/chromium']
    }
    return config
  },
}
module.exports = nextConfig
