# Single-container deployment: FastAPI backend + Next.js frontend,
# supervised by docker-entrypoint.sh (mirrors what electron-app/main.js
# does for the desktop build — same two proven processes).
#
# Build:
#   docker build -t htxpunk-mvgen .
# Run (see README/deployment docs for the full env var list):
#   docker run -p 3000:3000 -p 8000:8000 --env-file .env htxpunk-mvgen

# ── Stage 1: build the frontend ──────────────────────────────────────────
FROM node:20-slim AS frontend-build
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
# BACKEND_INTERNAL_URL must be set here, at build time — Next.js resolves
# next.config.js's rewrites() once when the build runs, not per-request.
# Both processes always share this container's network namespace, so this
# is a fixed, correct value for this deployment (not a per-user setting
# like it would be for the Electron build).
ENV BACKEND_INTERNAL_URL=http://127.0.0.1:8000
RUN npm run build

# ── Stage 2: runtime ──────────────────────────────────────────────────────
FROM python:3.11-slim AS runtime
RUN apt-get update && apt-get install -y --no-install-recommends \
      ffmpeg curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY backend/requirements.txt backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt

COPY backend/ backend/
RUN rm -rf backend/storage backend/__pycache__ && find backend -name "*.db" -delete

# Bring in the built frontend standalone server (see frontend/next.config.js's
# output: "standalone" — omits static assets/public/ on purpose, copied in
# separately here, same as electron-app/scripts/build-frontend.js does).
COPY --from=frontend-build /app/frontend/.next/standalone frontend/
COPY --from=frontend-build /app/frontend/.next/static frontend/.next/static

COPY docker-entrypoint.sh /app/docker-entrypoint.sh
RUN chmod +x /app/docker-entrypoint.sh

ENV PORT=3000
ENV BACKEND_PORT=8000
ENV LOCAL_STORAGE_PATH=/data/storage
ENV DATABASE_URL=sqlite+aiosqlite:////data/htxpunk.db
RUN mkdir -p /data/storage

EXPOSE 3000 8000
ENTRYPOINT ["/app/docker-entrypoint.sh"]
