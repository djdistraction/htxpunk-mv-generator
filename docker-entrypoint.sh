#!/bin/bash
# Starts both the FastAPI backend and the Next.js standalone frontend inside
# one container, mirroring exactly what electron-app/main.js does for the
# desktop build (spawn both, backend on :8000, frontend on :3000) — same
# two proven processes, just supervised by this script instead of Electron.
set -e

BACKEND_PORT="${BACKEND_PORT:-8000}"
PORT="${PORT:-3000}"

cd /app/backend
PYTHONPATH=/app/backend uvicorn main:app --host 0.0.0.0 --port "$BACKEND_PORT" &
BACKEND_PID=$!

cd /app/frontend
HOSTNAME=0.0.0.0 PORT="$PORT" node server.js &
FRONTEND_PID=$!

# Forward container stop signals to both children.
trap 'kill -TERM "$BACKEND_PID" "$FRONTEND_PID" 2>/dev/null' TERM INT

# Exit (and let the orchestrator restart the container) if either process
# dies unexpectedly, rather than limping along with only one half working.
wait -n "$BACKEND_PID" "$FRONTEND_PID"
EXIT_CODE=$?
kill -TERM "$BACKEND_PID" "$FRONTEND_PID" 2>/dev/null
exit "$EXIT_CODE"
