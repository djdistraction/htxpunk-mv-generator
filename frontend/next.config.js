/** @type {import("next").NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "assets.thevoodoohut.tv" },
      { protocol: "https", hostname: "*.r2.cloudflarestorage.com" }
    ]
  }
}
module.exports = nextConfig
