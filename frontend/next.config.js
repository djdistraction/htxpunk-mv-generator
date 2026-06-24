/** @type {import("next").NextConfig} */
const path = require("path")
const nextConfig = {
  turbopack: {
    // Tell Turbopack the actual project root so it doesn't traverse up to
    // C:\Users\booki and get confused by a package-lock.json there.
    root: path.resolve(__dirname, ".."),
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "assets.thevoodoohut.tv" },
      { protocol: "https", hostname: "*.r2.cloudflarestorage.com" },
      { protocol: "http", hostname: "localhost" },
    ]
  },
  async rewrites() {
    return [
      // Proxy /storage/* from the Next.js dev server (:3000) to FastAPI (:8000)
      // so <img src="/storage/..." /> works without hardcoding the backend port
      {
        source: "/storage/:path*",
        destination: "http://localhost:8000/storage/:path*",
      },
    ]
  },
}
module.exports = nextConfig
