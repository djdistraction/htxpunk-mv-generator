"""
Shared CI test setup.

Sets required env vars BEFORE any app module is imported, since config.py's
`settings = Settings()` reads them at import time (pydantic-settings), not
lazily. conftest.py is always collected by pytest before test modules, so
this is the one place that's guaranteed to run first.
"""
import asyncio
import os
import sys
import tempfile
from pathlib import Path

_TEST_STORAGE = tempfile.mkdtemp(prefix="htxpunk_test_storage_")

os.environ.setdefault("GROQ_API_KEY", "test_ci_key")
os.environ.setdefault("CLOUDFLARE_ACCOUNT_ID", "test_ci_account")
os.environ.setdefault("CLOUDFLARE_API_TOKEN", "test_ci_token")
os.environ.setdefault("IMAGE_BACKEND", "placeholder")
os.environ.setdefault("ALLOW_FALLBACK_VIDEO", "true")
os.environ.setdefault("LOCAL_STORAGE_PATH", _TEST_STORAGE)
os.environ.setdefault("DATABASE_URL", f"sqlite+aiosqlite:///{_TEST_STORAGE}/test.db")
os.environ.setdefault("WHISPER_MODEL", "tiny")

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import pytest  # noqa: E402


@pytest.fixture(scope="session", autouse=True)
def _init_test_db():
    from database import init_db
    asyncio.run(init_db())
    yield


@pytest.fixture()
def client():
    from fastapi.testclient import TestClient
    import main as main_module
    return TestClient(main_module.app)


@pytest.fixture()
def test_storage_dir():
    return _TEST_STORAGE
