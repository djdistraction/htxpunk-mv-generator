#!/usr/bin/env python3
"""Launch Studio v2 API (8010) + Next UI (3010)."""
from __future__ import annotations

import os
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent
BACKEND = ROOT / "studio" / "backend"
FRONTEND = ROOT / "studio" / "frontend"


def main() -> int:
    print("HTXpunk Studio v2")
    print("  API: http://127.0.0.1:8010")
    print("  UI:  http://127.0.0.1:3010")
    print("  (Legacy app remains on 8000/3000 if running.)")
    print()

    env = os.environ.copy()
    # Ensure monorepo backend is importable for shared services
    legacy = str(ROOT / "backend")
    env["PYTHONPATH"] = legacy + os.pathsep + env.get("PYTHONPATH", "")

    api = subprocess.Popen(
        [sys.executable, "-m", "uvicorn", "main:app", "--host", "127.0.0.1", "--port", "8010"],
        cwd=str(BACKEND),
        env=env,
    )
    time.sleep(1)
    ui = subprocess.Popen(
        ["npm", "run", "dev"],
        cwd=str(FRONTEND),
        env=env,
        shell=(os.name == "nt"),
    )
    try:
        api.wait()
        ui.wait()
    except KeyboardInterrupt:
        api.terminate()
        ui.terminate()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
