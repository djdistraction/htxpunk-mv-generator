/** @type {import("next").NextConfig} */
const path = require("path")
const nextConfig = {
  // Produces a minimal, self-contained server (.next/standalone/server.js)
  // with only the node_modules actually needed at runtime traced in — this
  // is what the Electron app bundles so packaged installs don't require a
  // separate Node.js/npm install on the user's machine.
  output: "standalone",
  // Pin the output-tracing root to this package itself (not an ancestor
  // directory), so `.next/standalone/server.js` always lands at a
  // predictable, flat path regardless of what lockfiles exist above this
  // repo on whatever machine runs the build — electron-app's build script
  // and main.js both assume that exact path.
  outputFileTracingRoot: path.resolve(__dirname),
  turbopack: {
    // Must match outputFileTracingRoot above (Next.js requires it) — also
    // avoids Turbopack traversing up to a stray lockfile above this repo.
    root: path.resolve(__dirname),
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
