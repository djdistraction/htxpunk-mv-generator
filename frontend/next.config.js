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
    // IMPORTANT: Next.js resolves rewrites() once, at build/config-load
    // time — it bakes the returned destination strings into the compiled
    // routes manifest. Setting BACKEND_INTERNAL_URL at container/process
    // runtime (after the build already ran) has NO effect, unlike a true
    // per-request read. This must be set at `next build` time for whatever
    // deployment is being built. It's still useful there: for a container
    // where both processes always share the same internal network (backend
    // always at 127.0.0.1:8000 inside that container), it's a fixed,
    // known-at-build-time value — just not a lever you can pull post-build.
    //
    // Literal 127.0.0.1, not "localhost": electron-app/main.js spawns the
    // backend with `--host 127.0.0.1` (IPv4 only). On Windows, "localhost"
    // often resolves to the IPv6 loopback (::1) first — a real, confirmed
    // failure: the packaged app's frontend got a clean connection refusal
    // trying ::1 while the backend only ever listened on the IPv4 address,
    // surfacing as a 500 on every /api/* call with no clearer error.
    const backend = process.env.BACKEND_INTERNAL_URL || "http://127.0.0.1:8000"
    return [
      { source: "/storage/:path*", destination: `${backend}/storage/:path*` },
      { source: "/api/:path*", destination: `${backend}/api/:path*` },
    ]
  },
}
module.exports = nextConfig
