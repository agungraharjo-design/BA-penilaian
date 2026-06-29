/** @type {import('next').NextConfig} */
const nextConfig = {
  images: { unoptimized: true },
  // For ALL packages - not just server components
  serverExternalPackages: [
    'playwright-core',
    '@sparticuz/chromium',
    '@sparticuz/chromium-core',
    '@sparticuz/chromium-fs',
  ],
  webpack: (config, { isServer, nextRuntime }) => {
    // Aggressively mark these as external for ALL builds
    if (isServer) {
      const externalPatterns = [
        'playwright-core',
        /^@sparticuz\/chromium/,
        /^@sparticuz\/chromium-/,
      ]
      for (const pattern of externalPatterns) {
        if (!config.externals.some(e => 
          (typeof e === 'string' && e.includes('playwright')) ||
          (typeof e === 'string' && e.includes('sparticuz')) ||
          (e instanceof RegExp && e.test('playwright-core'))
        )) {
          config.externals.push(pattern)
        }
      }
    }
    return config
  },
}
module.exports = nextConfig