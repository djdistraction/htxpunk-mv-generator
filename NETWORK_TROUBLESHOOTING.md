# Network Troubleshooting Guide

If you see this error during image generation:

```
NameResolutionError("HTTPSConnection(host=\'api-inference.huggingface.co\'...): Failed to resolve \'api-inference.huggingface.co\' ([Errno 11001] getaddrinfo failed)")
```

**Translation:** Your computer can't resolve the DNS name `api-inference.huggingface.co` (HuggingFace's image generation server).

## Quick Fixes (Try in Order)

### 1. Run the Diagnostic Script
```powershell
cd "C:\Users\booki\HTXpunk LLC\htxpunk-mv-generator"
py diagnose_network.py
```

This will test:
- Your internet connection
- DNS resolution
- HuggingFace API connectivity
- Your HF_TOKEN validity

### 2. Verify Your Internet Connection
```powershell
ping google.com
```

Should see responses like: `Reply from 142.251.32.14: bytes=32 time=12ms TTL=119`

If you get "Destination host unreachable" or "Timeout", your internet is down.

### 3. Verify DNS Works
```powershell
nslookup api-inference.huggingface.co
```

Should show an IP address like: `Server: 8.8.8.8` and `Address: 104.21.x.x`

If you get "Non-existent domain" or "Timed out", try:
```powershell
# Switch to Google's public DNS
ipconfig /flushdns
```

### 4. Check HuggingFace Token
1. Go to https://huggingface.co/settings/tokens
2. Create a new token if yours is old
3. Make sure it has "Read" access
4. Update your `.env` file:
   ```
   HF_TOKEN=hf_YOUR_NEW_TOKEN_HERE
   ```

### 5. Try From a Browser
Open this in your web browser:
```
https://api-inference.huggingface.co/models
```

Should show a list of models or an API error (that's OK). If you get a timeout or "Can't reach server", the issue is network-level.

## If You're Behind a Proxy/Corporate Firewall

The HuggingFace API might be blocked. Contact your IT team and ask them to whitelist:
- `api-inference.huggingface.co` (port 443)
- `huggingface.co` (port 443)

## If It's Intermittent

Network errors are sometimes transient. The app now retries automatically:
- **First failure:** Retries after 5 seconds
- **Second failure:** Retries after 10 seconds  
- **Third failure:** Gives up with error message

Just try your image generation again. It often works on the second attempt.

## Check HuggingFace Service Status

HuggingFace sometimes has outages. Check:
https://status.huggingface.co

If the status page shows "All Systems Operational", it's likely your network, not theirs.

## Still Stuck?

If the diagnostic script passes all checks but image generation still fails:

1. **Restart everything:**
   ```powershell
   # Kill all processes
   taskkill /IM python.exe /F
   taskkill /IM node.exe /F
   
   # Wait 10 seconds
   Start-Sleep -Seconds 10
   
   # Restart the app
   py run.py --electron
   ```

2. **Check backend logs:** Look for HF API errors in the Terminal 1 output

3. **Try a simpler song:** Use a 30-second test MP3 to isolate if it's a timeout issue

4. **Switch networks:** If on WiFi, try Ethernet (or vice versa)

## The Error in Detail

`Errno 11001` is Windows-specific for DNS resolution failure. It means:
- System DNS resolver couldn't reach nameservers
- OR nameservers don't have the domain in their cache
- OR the domain doesn't exist (very unlikely for api-inference.huggingface.co)

This is **not** an issue with the HTXpunk code — it's a network configuration issue.
