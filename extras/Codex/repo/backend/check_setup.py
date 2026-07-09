#!/usr/bin/env python3
"""
Setup validation script — check if everything is configured correctly.
Run this before starting the backend to catch configuration issues early.

Usage:
    python check_setup.py
"""

import sys
from pathlib import Path

def check_config():
    """Validate backend configuration."""
    print("\n🔍 Checking Backend Configuration...\n")

    from config import settings

    checks = [
        ("Database URL", settings.database_url, "sqlite" in settings.database_url or "postgresql" in settings.database_url),
        ("Storage backend", settings.storage_backend, settings.storage_backend in ["local", "r2"]),
        ("Video backend", settings.video_backend, settings.video_backend in ["ffmpeg", "runway"]),
        ("Whisper model", settings.whisper_model, settings.whisper_model in ["tiny", "base", "small", "medium"]),
        ("Groq API key", settings.groq_api_key, bool(settings.groq_api_key) and "YOUR_API_KEY" not in settings.groq_api_key),
        ("HuggingFace token", settings.hf_token, bool(settings.hf_token) and "YOUR_TOKEN" not in settings.hf_token),
    ]

    passed = 0
    failed = 0

    for name, value, is_valid in checks:
        if is_valid:
            print(f"✅ {name}: OK")
            passed += 1
        else:
            status = "NOT SET" if not value else "INVALID"
            print(f"❌ {name}: {status}")
            failed += 1

    return failed == 0


def check_dependencies():
    """Check if required Python packages are installed."""
    print("\n📦 Checking Dependencies...\n")

    deps = {
        "fastapi": "FastAPI",
        "uvicorn": "Uvicorn",
        "sqlalchemy": "SQLAlchemy",
        "aiosqlite": "AsyncSQLite",
        "groq": "Groq SDK",
        "faster_whisper": "Faster Whisper",
        "huggingface_hub": "HuggingFace Hub",
        "rembg": "RemBG",
        "PIL": "Pillow",
        "pydantic_settings": "Pydantic Settings",
    }

    passed = 0
    failed = 0
    missing = []

    for module, name in deps.items():
        try:
            __import__(module)
            print(f"✅ {name}: installed")
            passed += 1
        except ImportError:
            print(f"❌ {name}: NOT INSTALLED")
            missing.append(module)
            failed += 1

    if missing:
        print(f"\n📥 Fix with: pip install -r requirements.txt")

    return failed == 0, missing


def check_storage():
    """Check if storage directory can be created."""
    print("\n💾 Checking Storage...\n")

    from config import settings

    storage_path = Path(settings.local_storage_path)
    try:
        storage_path.mkdir(parents=True, exist_ok=True)
        print(f"✅ Storage path: {storage_path}")
        return True
    except Exception as e:
        print(f"❌ Storage path error: {e}")
        return False


def check_database():
    """Check if database can be initialized."""
    print("\n🗄️  Checking Database...\n")

    from config import settings

    if "sqlite" in settings.database_url:
        db_path = Path(settings.database_url.replace("sqlite+aiosqlite:///", ""))
        try:
            db_path.parent.mkdir(parents=True, exist_ok=True)
            print(f"✅ Database path: {db_path}")
            return True
        except Exception as e:
            print(f"❌ Database path error: {e}")
            return False
    elif "postgresql" in settings.database_url:
        print(f"✅ Using PostgreSQL: {settings.database_url.split('@')[1] if '@' in settings.database_url else 'configured'}")
        return True
    else:
        print(f"❌ Unknown database: {settings.database_url}")
        return False


def main():
    """Run all checks."""
    print("=" * 60)
    print("🎬 HTXpunk Productions — Setup Checker")
    print("=" * 60)

    try:
        config_ok = check_config()
    except Exception as e:
        print(f"❌ Config error: {e}")
        config_ok = False

    deps_ok, missing = check_dependencies()
    storage_ok = check_storage()
    database_ok = check_database()

    print("\n" + "=" * 60)
    print("📋 Summary")
    print("=" * 60)

    if all([config_ok, deps_ok, storage_ok, database_ok]):
        print("\n✅ All checks passed! You're ready to go.\n")
        print("Start the backend with:")
        print("  uvicorn main:app --reload --port 8000\n")
        return 0
    else:
        print("\n❌ Some checks failed. Please fix the issues above.\n")
        if missing:
            print(f"Install missing dependencies with:")
            print(f"  pip install -r requirements.txt\n")
        return 1


if __name__ == "__main__":
    sys.exit(main())
