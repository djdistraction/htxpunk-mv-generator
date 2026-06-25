#!/usr/bin/env python3
"""
Diagnose network connectivity issues with HuggingFace API and other services.
Run this if you see network errors during image generation.
"""
import socket
import sys
import os
from pathlib import Path

def check_dns(hostname):
    """Try to resolve a hostname."""
    try:
        ip = socket.gethostbyname(hostname)
        print(f"✓ DNS resolution OK: {hostname} → {ip}")
        return True
    except socket.gaierror as e:
        print(f"✗ DNS resolution FAILED: {hostname}")
        print(f"  Error: {e}")
        return False

def check_http_connectivity(url):
    """Try to fetch a URL."""
    try:
        import urllib.request
        response = urllib.request.urlopen(url, timeout=5)
        print(f"✓ HTTP connectivity OK: {url} (status {response.status})")
        return True
    except Exception as e:
        print(f"✗ HTTP connectivity FAILED: {url}")
        print(f"  Error: {e}")
        return False

def check_env_vars():
    """Check for required environment variables."""
    print("\n=== Environment Variables ===")

    env_file = Path(__file__).parent / ".env"
    if not env_file.exists():
        print(f"✗ No .env file found at {env_file}")
        return False

    print(f"✓ .env file found at {env_file}")

    from dotenv import load_dotenv
    load_dotenv(env_file)

    hf_token = os.getenv("HF_TOKEN", "")
    groq_key = os.getenv("GROQ_API_KEY", "")

    if not hf_token:
        print("✗ HF_TOKEN not set in .env")
        return False

    if hf_token.startswith("hf_"):
        print(f"✓ HF_TOKEN is set (starts with hf_)")
    else:
        print(f"⚠ HF_TOKEN doesn't look like a valid HuggingFace token (should start with hf_)")

    if not groq_key:
        print("✗ GROQ_API_KEY not set in .env")
    elif groq_key.startswith("gsk_"):
        print(f"✓ GROQ_API_KEY is set (starts with gsk_)")
    else:
        print(f"⚠ GROQ_API_KEY doesn't look like a valid Groq key (should start with gsk_)")

    return hf_token and groq_key

def check_hf_api():
    """Test HuggingFace API connectivity and authentication."""
    print("\n=== HuggingFace API Test ===")

    from dotenv import load_dotenv
    env_file = Path(__file__).parent / ".env"
    load_dotenv(env_file)

    hf_token = os.getenv("HF_TOKEN", "")
    if not hf_token:
        print("✗ HF_TOKEN not set, skipping HF API test")
        return False

    try:
        from huggingface_hub import InferenceClient
        client = InferenceClient(token=hf_token)

        # Try a simple model info call
        print("Testing HuggingFace API authentication...")
        # This will fail if DNS is down, or if token is invalid
        try:
            # Try to get user info to verify auth
            from huggingface_hub import whoami
            user = whoami(token=hf_token)
            print(f"✓ HuggingFace auth OK: logged in as {user['name']}")
            return True
        except Exception as e:
            if "Connection" in str(e) or "DNS" in str(e) or "resolve" in str(e):
                print(f"✗ Connection error (DNS/network): {e}")
            elif "401" in str(e) or "Unauthorized" in str(e):
                print(f"✗ Authentication failed: HF_TOKEN may be invalid")
                print(f"  Error: {e}")
            else:
                print(f"✗ HuggingFace API error: {e}")
            return False
    except ImportError:
        print("⚠ huggingface_hub not installed, install with: pip install huggingface_hub")
        return False

def main():
    print("=" * 60)
    print("HTXpunk Network Diagnostic Tool")
    print("=" * 60)

    all_ok = True

    print("\n=== Basic Connectivity ===")
    all_ok &= check_dns("google.com")
    all_ok &= check_dns("api-inference.huggingface.co")
    all_ok &= check_http_connectivity("https://www.google.com")

    print("\n=== Configuration ===")
    all_ok &= check_env_vars()

    print("\n=== HuggingFace API ===")
    all_ok &= check_hf_api()

    print("\n" + "=" * 60)
    if all_ok:
        print("✓ All checks passed! Your network setup looks good.")
        print("  If you still see errors, the issue may be transient.")
        print("  Try running your image generation again.")
    else:
        print("✗ Some checks failed. Here are the common fixes:")
        print("")
        print("1. DNS/Network issues:")
        print("   - Check your internet connection (try: ping google.com)")
        print("   - Restart your router")
        print("   - If on VPN/corporate network, check if api-inference.huggingface.co is blocked")
        print("   - Try a different DNS (e.g., 8.8.8.8)")
        print("")
        print("2. HuggingFace Token issues:")
        print("   - Get a new token from https://huggingface.co/settings/tokens")
        print("   - Make sure it has 'Read' permissions")
        print("   - Update HF_TOKEN in your .env file")
        print("")
        print("3. Still stuck?")
        print("   - Check: https://status.huggingface.co")
        print("   - Wait a few minutes and try again (transient network issues)")

    print("=" * 60)
    return 0 if all_ok else 1

if __name__ == "__main__":
    sys.exit(main())
