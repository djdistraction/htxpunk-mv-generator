"""
Storage abstraction — local filesystem by default.
Set storage_backend=r2 in .env to switch to Cloudflare R2 (same interface).
"""
import os
import uuid
import shutil
from pathlib import Path
from config import settings

LOCAL_ROOT = Path(settings.local_storage_path)
LOCAL_ROOT.mkdir(parents=True, exist_ok=True)

def _local_path(key: str) -> Path:
    p = LOCAL_ROOT / key
    p.parent.mkdir(parents=True, exist_ok=True)
    return p

def _local_url(key: str) -> str:
    # Served by FastAPI's StaticFiles mount at /storage
    return f"/storage/{key}"

def upload_bytes(data: bytes, key: str, content_type: str = "application/octet-stream") -> str:
    if settings.storage_backend == "r2":
        return _r2_upload_bytes(data, key, content_type)
    _local_path(key).write_bytes(data)
    return _local_url(key)

def upload_file_path(file_path: str, key: str, content_type: str = "application/octet-stream") -> str:
    if settings.storage_backend == "r2":
        return _r2_upload_file(file_path, key, content_type)
    shutil.copy2(file_path, _local_path(key))
    return _local_url(key)

def delete_project_files(project_id: str) -> None:
    """Best-effort removal of a project's internal storage folder on delete.
    Local backend only — R2 cleanup would need API calls we don't make here,
    so this silently no-ops for storage_backend=r2 rather than half-delete."""
    if settings.storage_backend != "local":
        return
    project_dir = LOCAL_ROOT / "projects" / project_id
    shutil.rmtree(project_dir, ignore_errors=True)

def get_local_path(key: str) -> str:
    """Return absolute local path — used by FFmpeg which can't read URLs."""
    return str(LOCAL_ROOT / key)

def url_to_local_path(url: str) -> str:
    """Convert a /storage/... URL back to an absolute local path."""
    key = url.removeprefix("/storage/")
    return str(LOCAL_ROOT / key)

# --- R2 backend (only imported if needed) ---

def _r2_client():
    import boto3
    return boto3.client(
        "s3",
        endpoint_url=f"https://{settings.r2_account_id}.r2.cloudflarestorage.com",
        aws_access_key_id=settings.r2_access_key_id,
        aws_secret_access_key=settings.r2_secret_access_key,
        region_name="auto",
    )

def _r2_upload_bytes(data: bytes, key: str, content_type: str) -> str:
    client = _r2_client()
    client.put_object(Bucket=settings.r2_bucket_name, Key=key, Body=data,
                      ContentType=content_type)
    return f"https://pub-{settings.r2_account_id}.r2.dev/{key}"

def _r2_upload_file(file_path: str, key: str, content_type: str) -> str:
    client = _r2_client()
    with open(file_path, "rb") as f:
        client.put_object(Bucket=settings.r2_bucket_name, Key=key, Body=f,
                          ContentType=content_type)
    return f"https://pub-{settings.r2_account_id}.r2.dev/{key}"
