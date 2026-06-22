import type { NextConfig } from 'next'
import path from 'path'

const nextConfig: NextConfig = {
  experimental: {
    externalDir: true,
  },
  webpack(config) {
    config.resolve.alias['@shared'] = path.resolve(__dirname, '../packages/shared/src')
    return config
  },
}

export default nextConfig
