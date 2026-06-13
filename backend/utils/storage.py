"""
Cloudflare R2 storage utility (S3-compatible, zero egress fees).
"""
import boto3
from botocore.config import Config
from config import settings


def _get_client():
    return boto3.client(
        "s3",
        endpoint_url=f"https://{settings.r2_account_id}.r2.cloudflarestorage.com",
        aws_access_key_id=settings.r2_access_key_id,
        aws_secret_access_key=settings.r2_secret_access_key,
        config=Config(signature_version="s3v4"),
        region_name="auto"
    )


def upload_bytes(data: bytes, path: str, content_type: str = "application/octet-stream") -> str:
    _get_client().put_object(
        Bucket=settings.r2_bucket_name,
        Key=path,
        Body=data,
        ContentType=content_type
    )
    return f"{settings.r2_public_url}/{path}"


def upload_file_path(local_path: str, dest_path: str, content_type: str = "application/octet-stream") -> str:
    with open(local_path, "rb") as f:
        return upload_bytes(f.read(), dest_path, content_type)


async def upload_file(file, dest_path: str) -> str:
    content = await file.read()
    return upload_bytes(content, dest_path, content_type=file.content_type or "application/octet-stream")
