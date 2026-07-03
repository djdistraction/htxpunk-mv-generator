#!/usr/bin/env python3
"""
Quick local check that Cloudflare Workers AI image generation works.

Run from the backend/ directory on a machine WITH network access:

    CLOUDFLARE_ACCOUNT_ID=xxxx CLOUDFLARE_API_TOKEN=yyyy python test_cloudflare.py

On success it writes cf_test.png and prints the size/dimensions.
On failure it prints the exact error so we can fix the integration.
"""
import os
import sys


def main():
    account_id = os.environ.get("CLOUDFLARE_ACCOUNT_ID", "").strip()
    api_token = os.environ.get("CLOUDFLARE_API_TOKEN", "").strip()

    if not account_id or not api_token:
        print("Set CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN environment variables.")
        print("  Account ID: dash.cloudflare.com -> Workers & Pages -> right sidebar")
        print("  Token: My Profile -> API Tokens -> Create Token -> Account · Workers AI · Edit")
        sys.exit(1)

    sys.path.insert(0, os.path.join(os.path.dirname(__file__), "services"))
    from cloudflare_image_generator import generate_with_cloudflare

    prompt = (
        "a neon-lit cyberpunk office at night, a stressed cartoon office worker "
        "at a desk, poisonous green and purple palette, cinematic music video still"
    )
    print(f"Calling Workers AI (FLUX.1-schnell) on account {account_id[:6]}…")
    try:
        png = generate_with_cloudflare(
            account_id=account_id,
            api_token=api_token,
            prompt=prompt,
            width=1280,
            height=720,
        )
    except Exception as e:
        print(f"\n❌ FAILED: {e}")
        sys.exit(2)

    out = os.path.join(os.path.dirname(__file__), "cf_test.png")
    with open(out, "wb") as f:
        f.write(png)

    try:
        from PIL import Image
        import io
        dims = Image.open(io.BytesIO(png)).size
    except Exception:
        dims = "unknown"

    is_png = png[:4] == b"\x89PNG"
    print(f"\n✅ SUCCESS — wrote {out}")
    print(f"   bytes: {len(png)} | dimensions: {dims} | PNG: {is_png}")
    print("   Open cf_test.png to see the real generated frame.")


if __name__ == "__main__":
    main()
