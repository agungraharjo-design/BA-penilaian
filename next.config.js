/** @type {import('next').NextConfig} */
const nextConfig = {
  images: { unoptimized: true },
  serverComponentsExternalPackages: ['@sparticuz/chromium'],
}
module.exports = nextConfig
