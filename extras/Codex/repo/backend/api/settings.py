"""
Credential validation, proxied through the backend.

Confirmed real bug this exists to fix: the Settings page previously
validated Groq/Cloudflare credentials with a direct browser fetch to each
provider's API. That works from the Electron setup wizard (loaded via
file://, apparently not subject to the same CORS enforcement) but is
flatly blocked by the browser's CORS policy when run from the Next.js
frontend served over http://127.0.0.1:3000 — neither Groq's nor
Cloudflare's API sends Access-Control-Allow-Origin for arbitrary origins,
so the browser refuses to expose the response no matter how valid the
credentials are. A server-to-server call isn't subject to CORS at all,
since CORS is a browser-enforced restriction on client-side JavaScript.
"""
import httpx
from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter()


class GroqValidateRequest(BaseModel):
    api_key: str


class CloudflareValidateRequest(BaseModel):
    account_id: str
    api_token: str


@router.post("/validate-groq")
async def validate_groq(payload: GroqValidateRequest) -> dict:
    if not payload.api_key.strip():
        return {"valid": False}
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            resp = await client.get(
                "https://api.groq.com/openai/v1/models",
                headers={"Authorization": f"Bearer {payload.api_key.strip()}"},
            )
        return {"valid": resp.status_code == 200}
    except httpx.HTTPError:
        return {"valid": False}


@router.post("/validate-cloudflare")
async def validate_cloudflare(payload: CloudflareValidateRequest) -> dict:
    # Hit a Workers AI endpoint, not the general account-details endpoint — a
    # token scoped only to "Workers AI: Edit" (exactly what we tell users to
    # create) can't read general account details and would fail that check
    # even though it's perfectly valid for image generation. Listing models
    # is a read, so it's free and doesn't burn the daily allocation.
    if not payload.account_id.strip() or not payload.api_token.strip():
        return {"valid": False}
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            resp = await client.get(
                f"https://api.cloudflare.com/client/v4/accounts/{payload.account_id.strip()}/ai/models/search",
                headers={"Authorization": f"Bearer {payload.api_token.strip()}"},
            )
        if resp.status_code != 200:
            return {"valid": False}
        data = resp.json()
        return {"valid": data.get("success") is True}
    except httpx.HTTPError:
        return {"valid": False}
