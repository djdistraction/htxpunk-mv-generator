# Network Error Fix — Image Generation Now Handles DNS Issues

## What You Saw

When generating images, you got this error:

```
NameResolutionError("HTTPSConnection(host=\'api-inference.huggingface.co\'...): 
Failed to resolve \'api-inference.huggingface.co\' ([Errno 11001] getaddrinfo failed)")
```

**Translation:** The system couldn't reach HuggingFace's API server (DNS resolution failure).

## What's Been Fixed

### 1. **Automatic Retry Logic** ✅
The image generation service now automatically retries when it hits network errors:
- First attempt fails? Wait 5 seconds and try again
- Second attempt fails? Wait 10 seconds and try again
- Third attempt fails? Give a clear error message

This handles transient network hiccups gracefully.

**File:** `backend/services/image_generator.py`

### 2. **Better Error Messages** ✅
You now get helpful, specific errors:
- **DNS/Network error** → "Network error, retrying..."
- **Invalid HF token** → "HuggingFace authentication failed. Check HF_TOKEN in .env is valid."
- **Rate limited** → "Rate limited, waiting..."

Instead of generic "Max retries exceeded" with confusing stack traces.

### 3. **Diagnostic Tools** ✅
Three new tools to troubleshoot network issues:

#### **Option A: Run the Diagnostic Script** (Recommended)
```powershell
py run.py --diagnose
```

This will check:
- Internet connectivity (ping google.com)
- DNS resolution (can we find api-inference.huggingface.co?)
- HTTPS connectivity to HuggingFace
- Your HF_TOKEN validity
- Authentication to HuggingFace API

Takes ~10 seconds and gives you a clear pass/fail report.

#### **Option B: Use the Launcher with Built-in Check**
```powershell
py run.py --electron
```

The launcher now supports the `--diagnose` flag for standalone checks before running the app.

#### **Option C: Manual Windows Diagnostics**
```powershell
# Test internet connectivity
ping google.com

# Test DNS resolution for HuggingFace
nslookup api-inference.huggingface.co

# Test HTTPS connectivity
# (Open this in your browser - should show a page or API error, not a timeout)
# https://api-inference.huggingface.co/models
```

### 4. **Comprehensive Troubleshooting Guide** ✅
New file: `NETWORK_TROUBLESHOOTING.md`

Contains:
- What each error means
- Step-by-step fixes for common issues
- How to handle proxy/firewall blocking
- How to detect if it's HuggingFace's issue vs yours
- Contact info for corporate IT help

## How to Use (When You See the Error)

### **Quick Path:**
1. Run the diagnostic: `py run.py --diagnose`
2. Follow the suggestions it gives
3. Try your image generation again

### **Detailed Path:**
1. Read `NETWORK_TROUBLESHOOTING.md`
2. Check your internet connection
3. Verify your HF_TOKEN is correct
4. Run the diagnostic script
5. Try the fix that applies to your situation
6. Retry image generation

## What's Different Now?

| Before | After |
|--------|-------|
| One DNS error = app crashes | Retries 3 times automatically |
| Unhelpful error messages | Clear, actionable error messages |
| No way to diagnose | Full diagnostic toolkit included |
| Had to be technical | Guided troubleshooting steps |

## Success Indicators

After applying this fix:
- **Scenario 1:** Your network is fine → Image generation works immediately ✓
- **Scenario 2:** Transient network issue → Retries handle it automatically ✓
- **Scenario 3:** Network is broken → `py run.py --diagnose` shows exactly what's wrong ✓
- **Scenario 4:** HF token is invalid → Clear error tells you to update `.env` ✓

## For Developers

The retry logic is in:
- **Service:** `backend/services/image_generator.py` → `generate_image()` function
- **Retry count:** 3 attempts (configurable)
- **Backoff strategy:** Exponential (5s, 10s, 15s)
- **Error detection:** Looks for DNS/network error markers in exception string

To make retries more aggressive (shorter wait times):
```python
# In generate_image():
max_retries = 5
retry_delay = 2  # start at 2s instead of 5s
```

To add retry logic to other services:
```python
from PIL import Image
from config import settings

# Copy the try/except pattern from image_generator.py
for attempt in range(max_retries):
    try:
        # ... do API call ...
    except Exception as e:
        if attempt < max_retries - 1:
            # Check error type and retry
            time.sleep(retry_delay)
        else:
            raise
```

## Testing

To test the retry logic:
```powershell
# 1. Temporarily break your internet or DNS
# 2. Start the app and try to generate an image
# 3. Should retry 3 times automatically
# 4. Check Terminal 1 for "Network error, retrying..." messages

# Or simulate the error in Python:
py -c "
from backend.services.image_generator import generate_image
try:
    generate_image('test prompt')
except Exception as e:
    print(f'Error: {e}')
"
```

## Next Steps

1. **Immediate:** Run `py run.py --diagnose` to verify your setup
2. **If all green:** Try your image generation again (should work now!)
3. **If any red:** Follow the troubleshooting guide
4. **Still stuck?** Check HuggingFace status at https://status.huggingface.co

---

**Status:** ✅ Complete — Network error handling improved, diagnostic tools added.
