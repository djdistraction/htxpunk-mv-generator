#!/usr/bin/env python3
"""
HTXpunk MV Generator — one-command launcher.

This single script takes care of the local development launch:

  1. Checks that Python and Node.js are installed
  2. Asks for your Groq + Cloudflare credentials when needed and writes .env
  3. Installs all backend, frontend, and optional Electron dependencies
  4. Frees ports 8000 / 3000 if a previous run left something behind
  5. Starts the backend and waits until it is healthy
  6. Starts the frontend
  7. Opens the app in your browser, or the desktop window with --electron
  8. Cleans everything up when you press Ctrl+C

Usage:
    py run.py                # backend + frontend, opens in your browser
    py run.py --electron     # backend + frontend + the Electron desktop app
    py run.py --no-install   # skip dependency installation for faster restarts
    py run.py --diagnose     # run network diagnostics and exit

You can leave this window open while you use the app. Press Ctrl+C here to
shut everything down.
"""

import argparse
import atexit
import os
import shutil
import signal
import socket
import subprocess
import sys
import threading
import time
import urllib.request
import webbrowser
from pathlib import Path

# ── Paths ───────────────────────────────────────────────────────────────────
ROOT = Path(__file__).resolve().parent
BACKEND_DIR = ROOT / "backend"
FRONTEND_DIR = ROOT / "frontend"
ELECTRON_DIR = ROOT / "electron-app"
ENV_FILE = ROOT / ".env"

BACKEND_PORT = 8000
FRONTEND_PORT = 3000

IS_WINDOWS = os.name == "nt"
DEFAULT_DATA_DIR = Path.home() / ".htxpunk-mv-generator" / "storage"
DEFAULT_DATABASE_URL = f"sqlite+aiosqlite:///{DEFAULT_DATA_DIR / 'htxpunk.db'}"

# Track child processes so we can clean them up on exit.
_children: list[subprocess.Popen] = []


# ── Pretty printing ─────────────────────────────────────────────────────────
def say(msg: str) -> None:
    print(f"\n\033[1;35m▶ {msg}\033[0m", flush=True)


def ok(msg: str) -> None:
    print(f"  \033[1;32m✓\033[0m {msg}", flush=True)


def warn(msg: str) -> None:
    print(f"  \033[1;33m!\033[0m {msg}", flush=True)


def fail(msg: str) -> None:
    print(f"\n\033[1;31m✗ {msg}\033[0m", flush=True)


# ── Subprocess helpers ──────────────────────────────────────────────────────
def stream_output(proc: subprocess.Popen, prefix: str) -> None:
    """Read a process's combined output and echo it with a label."""
    for line in iter(proc.stdout.readline, ""):
        if line:
            print(f"  [{prefix}] {line.rstrip()}", flush=True)
    proc.stdout.close()


def run_blocking(cmd, cwd: Path, shell: bool = False) -> int:
    """Run a command to completion, streaming its output. Returns exit code."""
    printable = cmd if isinstance(cmd, str) else " ".join(cmd)
    print(f"  $ {printable}", flush=True)
    proc = subprocess.Popen(
        cmd,
        cwd=str(cwd),
        shell=shell,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        bufsize=1,
    )
    for line in iter(proc.stdout.readline, ""):
        if line:
            print(f"    {line.rstrip()}", flush=True)
    proc.stdout.close()
    return proc.wait()


def start_background(cmd, cwd: Path, prefix: str, shell: bool = False,
                     extra_env: dict | None = None) -> subprocess.Popen:
    """Launch a long-running process in the background, streaming its output."""
    env = os.environ.copy()
    if extra_env:
        env.update(extra_env)

    creationflags = 0
    if IS_WINDOWS:
        # Lets us kill the whole process tree cleanly later.
        creationflags = subprocess.CREATE_NEW_PROCESS_GROUP

    proc = subprocess.Popen(
        cmd,
        cwd=str(cwd),
        shell=shell,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        bufsize=1,
        env=env,
        creationflags=creationflags,
    )
    _children.append(proc)
    threading.Thread(target=stream_output, args=(proc, prefix), daemon=True).start()
    return proc


def npm_command(args: str):
    """Build an npm command that runs reliably on Windows and Unix."""
    # On Windows, npm is npm.cmd and is most reliable through the shell.
    if IS_WINDOWS:
        return (f"npm {args}", True)  # (command, shell)
    return (["npm"] + args.split(), False)


# ── Cleanup ─────────────────────────────────────────────────────────────────
def kill_process(proc: subprocess.Popen) -> None:
    if proc.poll() is not None:
        return
    try:
        if IS_WINDOWS:
            # Kill the entire tree (npm spawns node children).
            subprocess.run(
                ["taskkill", "/F", "/T", "/PID", str(proc.pid)],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
        else:
            proc.terminate()
            try:
                proc.wait(timeout=5)
            except subprocess.TimeoutExpired:
                proc.kill()
    except Exception:
        pass


def shutdown(*_args) -> None:
    say("Shutting down… (this may take a few seconds)")
    for proc in _children:
        kill_process(proc)
    print("\nGoodbye. 👋", flush=True)
    # Avoid running shutdown twice (atexit + signal).
    os._exit(0)


# ── Port helpers ────────────────────────────────────────────────────────────
def port_in_use(port: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.settimeout(0.5)
        return s.connect_ex(("127.0.0.1", port)) == 0


def free_port(port: int) -> None:
    """Best-effort: kill whatever is listening on a port from a previous run."""
    if not port_in_use(port):
        return
    warn(f"Port {port} is in use — trying to free it…")
    try:
        if IS_WINDOWS:
            out = subprocess.run(
                ["netstat", "-ano"], capture_output=True, text=True
            ).stdout
            pids = set()
            for line in out.splitlines():
                if f":{port} " in line and "LISTENING" in line:
                    pids.add(line.split()[-1])
            for pid in pids:
                subprocess.run(
                    ["taskkill", "/F", "/PID", pid],
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL,
                )
        else:
            out = subprocess.run(
                ["lsof", "-ti", f"tcp:{port}"], capture_output=True, text=True
            ).stdout
            for pid in out.split():
                subprocess.run(["kill", "-9", pid],
                               stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        time.sleep(1.0)
        if port_in_use(port):
            warn(f"Could not free port {port}. You may need to close it manually.")
        else:
            ok(f"Freed port {port}.")
    except Exception as e:
        warn(f"Couldn't free port {port} automatically ({e}).")


# ── Health / readiness ──────────────────────────────────────────────────────
def wait_for_health(port: int, timeout: int = 120) -> bool:
    url = f"http://127.0.0.1:{port}/health"
    start = time.time()
    while time.time() - start < timeout:
        # If the backend process died, stop waiting.
        for proc in _children:
            if proc.poll() is not None and proc.returncode not in (0, None):
                return False
        try:
            with urllib.request.urlopen(url, timeout=2) as resp:
                if resp.status == 200:
                    return True
        except Exception:
            pass
        time.sleep(1)
    return False


def wait_for_port(port: int, timeout: int = 120) -> bool:
    start = time.time()
    while time.time() - start < timeout:
        if port_in_use(port):
            return True
        time.sleep(1)
    return False


# ── Prerequisite checks ─────────────────────────────────────────────────────
def check_prerequisites() -> None:
    say("Checking prerequisites")

    if sys.version_info < (3, 11):
        warn(f"Python {sys.version_info.major}.{sys.version_info.minor} detected. "
             "Python 3.11+ is recommended.")
    else:
        ok(f"Python {sys.version_info.major}.{sys.version_info.minor}")

    if shutil.which("npm") is None:
        fail("Node.js / npm not found on your PATH.")
        print("  Install Node.js from https://nodejs.org and re-run this script.")
        sys.exit(1)
    ok("Node.js / npm found")

    if shutil.which("ffmpeg") is None:
        warn("FFmpeg not found on PATH. The app can still use the bundled "
             "imageio-ffmpeg fallback for local video assembly.")
    else:
        ok("FFmpeg found")


# ── .env handling ───────────────────────────────────────────────────────────
def read_env() -> dict:
    data = {}
    if ENV_FILE.exists():
        for line in ENV_FILE.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, val = line.partition("=")
            data[key.strip()] = val.strip()
    return data


def write_env(values: dict) -> None:
    image_backend = (values.get("IMAGE_BACKEND") or "cloudflare").strip().lower()
    if image_backend not in {"cloudflare", "gemini", "placeholder"}:
        image_backend = "cloudflare"

    local_storage_path = values.get("LOCAL_STORAGE_PATH") or str(DEFAULT_DATA_DIR)
    database_url = values.get("DATABASE_URL") or DEFAULT_DATABASE_URL

    lines = [
        "# HTXpunk MV Generator configuration",
        "# Generated/updated by run.py",
        "",
        "# LLM / text analysis",
        f"GROQ_API_KEY={values.get('GROQ_API_KEY', '')}",
        f"GROQ_MODEL={values.get('GROQ_MODEL', 'llama-3.3-70b-versatile')}",
        "",
        "# Image generation backend: cloudflare | gemini | placeholder",
        f"IMAGE_BACKEND={image_backend}",
        "",
        "# Cloudflare Workers AI image generation",
        f"CLOUDFLARE_ACCOUNT_ID={values.get('CLOUDFLARE_ACCOUNT_ID', '')}",
        f"CLOUDFLARE_API_TOKEN={values.get('CLOUDFLARE_API_TOKEN', '')}",
        "",
        "# Gemini/Imagen only if IMAGE_BACKEND=gemini",
        f"GEMINI_API_KEY={values.get('GEMINI_API_KEY', '')}",
        "",
        "# Audio transcription",
        f"WHISPER_MODEL={values.get('WHISPER_MODEL', 'base')}",
        "",
        "# Local storage / database",
        "STORAGE_BACKEND=local",
        f"LOCAL_STORAGE_PATH={local_storage_path}",
        f"DATABASE_URL={database_url}",
        "",
        "# Video generation",
        f"VIDEO_BACKEND={values.get('VIDEO_BACKEND', 'ffmpeg')}",
        f"VIDEO_FPS={values.get('VIDEO_FPS', '25')}",
        f"CLIP_DURATION={values.get('CLIP_DURATION', '5')}",
        f"OUTPUT_RESOLUTION={values.get('OUTPUT_RESOLUTION', '1920x1080')}",
        "",
        "# Modal serverless GPU only if VIDEO_BACKEND=modal",
        f"LIPSYNC_ENABLED={values.get('LIPSYNC_ENABLED', 'true')}",
        f"MODAL_TOKEN_ID={values.get('MODAL_TOKEN_ID', '')}",
        f"MODAL_TOKEN_SECRET={values.get('MODAL_TOKEN_SECRET', '')}",
        "",
    ]
    ENV_FILE.write_text("\n".join(lines), encoding="utf-8")


def is_placeholder(value: str) -> bool:
    if not value:
        return True
    v = value.lower().strip()
    return (
        "your_api_key" in v
        or "your_token" in v
        or "your_account" in v
        or v in ("gsk_...", "hf_...", "...")
        or v.endswith("_here")
    )


def ensure_env() -> None:
    say("Checking API keys (.env)")
    values = read_env()

    image_backend = (values.get("IMAGE_BACKEND") or "cloudflare").strip().lower()
    if image_backend not in {"cloudflare", "gemini", "placeholder"}:
        warn(f"Unknown IMAGE_BACKEND={image_backend!r}; resetting to cloudflare")
        image_backend = "cloudflare"

    groq = values.get("GROQ_API_KEY", "")
    cf_account_id = values.get("CLOUDFLARE_ACCOUNT_ID", "")
    cf_token = values.get("CLOUDFLARE_API_TOKEN", "")
    gemini = values.get("GEMINI_API_KEY", "")

    need_groq = is_placeholder(groq)
    need_cloudflare = image_backend == "cloudflare" and (
        is_placeholder(cf_account_id) or is_placeholder(cf_token)
    )
    need_gemini = image_backend == "gemini" and is_placeholder(gemini)

    if not (need_groq or need_cloudflare or need_gemini):
        ok(f"API keys already configured (IMAGE_BACKEND={image_backend})")
        return

    print("\n  The app reads credentials from the project .env file.")
    print("  They are saved locally and are not committed to Git.\n")

    if need_groq:
        print("  • Groq API key — get one at https://console.groq.com")
        print("    Create New Key → it starts with 'gsk_'")
        entered = input("    Paste GROQ_API_KEY, or press Enter to leave blank: ").strip()
        if entered:
            groq = entered

    if need_cloudflare:
        print("\n  • Cloudflare Workers AI credentials for image generation")
        print("    Account ID: dash.cloudflare.com → Workers & Pages → right sidebar")
        print("    API Token: My Profile → API Tokens → Account · Workers AI · Edit")
        print("    Press Enter on both prompts to use IMAGE_BACKEND=placeholder for a local smoke test.")
        entered = input("    Paste CLOUDFLARE_ACCOUNT_ID: ").strip()
        if entered:
            cf_account_id = entered
        entered = input("    Paste CLOUDFLARE_API_TOKEN: ").strip()
        if entered:
            cf_token = entered
        if is_placeholder(cf_account_id) or is_placeholder(cf_token):
            warn("Cloudflare credentials are incomplete. Switching to IMAGE_BACKEND=placeholder so the app can start for local testing.")
            image_backend = "placeholder"

    if need_gemini:
        print("\n  • Gemini API key — only required because IMAGE_BACKEND=gemini")
        entered = input("    Paste GEMINI_API_KEY, or press Enter to switch to placeholder: ").strip()
        if entered:
            gemini = entered
        else:
            warn("Gemini key missing. Switching to IMAGE_BACKEND=placeholder so the app can start for local testing.")
            image_backend = "placeholder"

    values["GROQ_API_KEY"] = groq
    values["IMAGE_BACKEND"] = image_backend
    values["CLOUDFLARE_ACCOUNT_ID"] = cf_account_id
    values["CLOUDFLARE_API_TOKEN"] = cf_token
    values["GEMINI_API_KEY"] = gemini
    values.setdefault("LOCAL_STORAGE_PATH", str(DEFAULT_DATA_DIR))
    values.setdefault("DATABASE_URL", DEFAULT_DATABASE_URL)
    values.setdefault("VIDEO_BACKEND", "ffmpeg")
    values.setdefault("WHISPER_MODEL", "base")

    write_env(values)

    if image_backend == "placeholder":
        ok("Saved .env using IMAGE_BACKEND=placeholder for local smoke testing")
        warn("Placeholder mode starts the app without paid/image credentials, but it will not generate final production-quality AI images.")
    else:
        ok(f"Saved .env using IMAGE_BACKEND={image_backend}")


# ── Dependency installation ─────────────────────────────────────────────────
def backend_deps_installed() -> bool:
    try:
        subprocess.run(
            [sys.executable, "-c", "import uvicorn, fastapi, faster_whisper"],
            cwd=str(BACKEND_DIR),
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            check=True,
        )
        return True
    except Exception:
        return False


def install_dependencies(want_electron: bool) -> None:
    say("Installing dependencies (first run can take several minutes)")

    if backend_deps_installed():
        ok("Backend dependencies already installed")
    else:
        print("  Installing backend (Python) packages…")
        code = run_blocking(
            [sys.executable, "-m", "pip", "install", "-r", "requirements.txt"],
            cwd=BACKEND_DIR,
        )
        if code != 0:
            fail("Backend dependency installation failed. See messages above.")
            sys.exit(1)
        ok("Backend dependencies installed")

    if (FRONTEND_DIR / "node_modules").exists():
        ok("Frontend dependencies already installed")
    else:
        print("  Installing frontend (npm) packages…")
        cmd, shell = npm_command("install")
        code = run_blocking(cmd, cwd=FRONTEND_DIR, shell=shell)
        if code != 0:
            fail("Frontend dependency installation failed. See messages above.")
            sys.exit(1)
        ok("Frontend dependencies installed")

    if want_electron:
        if (ELECTRON_DIR / "node_modules").exists():
            ok("Electron dependencies already installed")
        else:
            print("  Installing Electron (npm) packages…")
            cmd, shell = npm_command("install")
            code = run_blocking(cmd, cwd=ELECTRON_DIR, shell=shell)
            if code != 0:
                fail("Electron dependency installation failed. See messages above.")
                sys.exit(1)
            ok("Electron dependencies installed")


# ── Service startup ─────────────────────────────────────────────────────────
def start_backend() -> None:
    say("Starting backend (FastAPI on port 8000)")
    free_port(BACKEND_PORT)
    start_background(
        [sys.executable, "-m", "uvicorn", "main:app",
         "--port", str(BACKEND_PORT), "--host", "127.0.0.1"],
        cwd=BACKEND_DIR,
        prefix="backend",
    )
    print("  Waiting for backend to become healthy…", flush=True)
    if wait_for_health(BACKEND_PORT):
        ok("Backend is healthy (http://127.0.0.1:8000/health)")
    else:
        fail("Backend did not start. Check the [backend] messages above.")
        shutdown()


def start_frontend() -> None:
    say("Starting frontend (Next.js on port 3000)")
    free_port(FRONTEND_PORT)
    # Clean the dev build cache before startup. A stale .next cache can keep
    # serving an old route manifest and produce 404s for routes that exist on
    # disk, such as /projects/[id]/treatment after pulling new code.
    cmd, shell = npm_command("run clean-dev")
    start_background(cmd, cwd=FRONTEND_DIR, prefix="frontend", shell=shell)
    print("  Waiting for frontend to come up…", flush=True)
    if wait_for_port(FRONTEND_PORT):
        ok("Frontend is up (http://localhost:3000)")
    else:
        warn("Frontend is taking a while — it may still be compiling.")


def start_electron() -> None:
    say("Starting the desktop app (Electron)")
    cmd, shell = npm_command("start")
    start_background(
        cmd, cwd=ELECTRON_DIR, prefix="electron", shell=shell,
        extra_env={"HTXPUNK_SKIP_BACKEND": "1"},
    )
    ok("Electron window launching…")


# ── Main ────────────────────────────────────────────────────────────────────
def main() -> None:
    parser = argparse.ArgumentParser(description="Launch HTXpunk MV Generator")
    parser.add_argument("--electron", action="store_true",
                        help="Open the Electron desktop app instead of a browser tab")
    parser.add_argument("--no-install", action="store_true",
                        help="Skip dependency installation")
    parser.add_argument("--diagnose", action="store_true",
                        help="Run network diagnostics and exit")
    args = parser.parse_args()

    if args.diagnose:
        print("\033[1;36m" + "=" * 60)
        print("  HTXpunk Network Diagnostic Tool")
        print("=" * 60 + "\033[0m\n")
        diagnose_script = ROOT / "diagnose_network.py"
        subprocess.run([sys.executable, str(diagnose_script)])
        sys.exit(0)

    print("\033[1;35m" + "=" * 60)
    print("  HTXpunk MV Generator — Launcher")
    print("=" * 60 + "\033[0m")

    # Clean shutdown on Ctrl+C / termination.
    signal.signal(signal.SIGINT, shutdown)
    if hasattr(signal, "SIGTERM"):
        signal.signal(signal.SIGTERM, shutdown)
    atexit.register(lambda: [kill_process(p) for p in _children])

    check_prerequisites()
    ensure_env()
    if not args.no_install:
        install_dependencies(want_electron=args.electron)
    else:
        warn("Skipping dependency installation (--no-install)")

    start_backend()
    start_frontend()

    if args.electron:
        start_electron()
    else:
        say("Opening the app in your browser")
        time.sleep(2)
        try:
            webbrowser.open("http://localhost:3000")
        except Exception:
            pass
        ok("If a tab didn't open, go to http://localhost:3000")

    print("\n\033[1;32m" + "=" * 60)
    print("  ✅  Everything is running!")
    print("=" * 60 + "\033[0m")
    print("  • App:      http://localhost:3000")
    print("  • Backend:  http://127.0.0.1:8000/health")
    if args.electron:
        print("  • Desktop:  Electron window")
    print("\n  Leave this window open while you use the app.")
    print("  Press \033[1mCtrl+C\033[0m here to stop everything.\n")

    # Keep the launcher alive; watch for a service dying unexpectedly.
    try:
        while True:
            time.sleep(2)
            for proc in _children:
                if proc.poll() is not None and proc.returncode not in (0, None):
                    warn("A service stopped unexpectedly. Shutting down.")
                    shutdown()
    except KeyboardInterrupt:
        shutdown()


if __name__ == "__main__":
    main()
