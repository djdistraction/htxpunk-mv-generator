# Implementation plan (future work)

This document lists planned changes; the items below are not implemented unless they appear in code changes in this PR.

## Backend Changes

### 1. New Files to Create

#### `backend/errors.py`
Custom exception classes for structured error handling with categories, retry logic, and detailed context preservation.

#### `backend/validators.py`
Input validation utilities for audio files, Pydantic field validators, and file magic bytes verification.

#### `backend/utils/retry.py`
Exponential backoff retry logic for transient failures (API timeouts, rate limits, network errors).

#### `backend/utils/cleanup.py`
Asset garbage collection, retention policies, and lifecycle tracking for old/orphaned files.

#### `backend/middleware/security.py`
Security middleware for headers (CSP, X-Frame-Options, X-Content-Type-Options) and rate limiting.

### 2. Files to Modify

#### `backend/requirements.txt`
Add new dependencies:
- pytest>=7.4.0
- pytest-asyncio>=0.21.0
- slowapi>=0.1.9
- apscheduler>=3.10.4
- python-multipart>=0.0.9 (already present)

#### `backend/config.py`
- Add Pydantic Field validators for API keys (format validation)
- Add security configuration (allowed origins, rate limit settings)
- Add cleanup job configuration

#### `backend/main.py`
- Import and register security middleware
- Add error handlers for custom exceptions
- Integrate rate limiting
- Add APScheduler for cleanup jobs in lifespan
- Enhanced health endpoint with detailed diagnostics

#### `backend/orchestrator.py`
- Convert sync SQLite polling to async
- Improve error handling with PipelineError categorization
- Add exponential backoff retry logic
- Better logging with structured context
- Add metrics tracking (retry counts, error rates)

#### `backend/database.py`
- Add async helper functions alongside sync functions
- Improve connection handling
- Add error recovery logic

#### `backend/api/projects.py`
- Add file upload validation (format, size, duration)
- Implement magic bytes verification
- Better error messages for validation failures
- Add transaction handling for atomic operations

#### `backend/api/pipeline.py`
- Add error boundary handling
- Improve request validation
- Better error responses

## Frontend Changes

### 1. New Files to Create

#### `frontend/lib/types.ts`
Strict TypeScript interfaces for:
- Project, ProjectCreate, ProjectDetail
- PipelineStage type definitions
- Treatment, Analysis, Elements interfaces
- Asset, AssetRow interfaces
- All API request/response types

#### `frontend/lib/toasts.tsx`
Toast notification system using react-hot-toast with helpers for:
- Success notifications
- Error notifications with retry buttons
- Info notifications
- Loading toasts

#### `frontend/components/ErrorBoundary.tsx`
React Error Boundary component for crash handling with:
- Fallback UI
- Error details in development
- Recovery button
- Logging

#### `frontend/hooks/useAsync.ts`
Custom hook for async operations with:
- Loading state
- Error state with retry logic
- Success state
- Automatic cleanup

### 2. Files to Modify

#### `frontend/package.json`
Add dependencies:
- react-hot-toast>=2.4.1
- axios-retry (optional, for auto-retry)

#### `frontend/lib/api.ts`
- Add proper TypeScript types to all functions
- Improve error handling with categorization
- Add retry logic for transient errors
- Add timeout handling
- Better error messages

#### `frontend/app/layout.tsx`
- Wrap app with ErrorBoundary
- Add Toaster from react-hot-toast
- Ensure providers are in correct order

#### `frontend/app/page.tsx`
- Replace `any` types with proper interfaces
- Add toast notifications for errors and successes
- Add retry functionality
- Debounce refresh button
- Better error messages

#### `frontend/app/projects/[id]/ProjectDetail.tsx`
- Replace `any` types with Project interface
- Add toast notifications
- Implement loading states on buttons
- Add error recovery UI
- Prevent double-click submissions

#### `frontend/app/projects/[id]/treatment/TreatmentDetail.tsx`
- Add type safety
- Implement toast notifications
- Add loading indicators
- Error recovery

#### `frontend/app/projects/[id]/manifest/ManifestDetail.tsx`
- Add type safety
- Toast notifications
- Loading states
- Better error messages

#### `frontend/app/projects/[id]/storyboard/StoryboardDetail.tsx`
- Add type safety
- Toast notifications
- Error handling

#### `frontend/components/ReferenceUploader.tsx`
- Add error handling for upload failures
- Type safety improvements
- Toast notifications

## Testing

### New Files to Create

#### `tests/conftest.py`
Pytest fixtures for:
- Mock database
- Mock external APIs (Groq, FLUX, etc.)
- Async test client
- Project factory fixtures

#### `tests/test_orchestrator.py`
Test orchestrator logic:
- Dispatch and worker queuing
- Human gate skipping
- Retry logic and backoff
- Error handling and recovery
- In-flight tracking

#### `tests/test_api.py`
Test API endpoints:
- File upload validation
- Project creation
- Treatment approval/rejection
- Storyboard approval
- Error responses

#### `tests/test_validators.py`
Test input validation:
- Audio file format validation
- File size limits
- Duration validation
- Magic bytes verification

#### `tests/test_errors.py`
Test error classes:
- Error categorization
- Retry eligibility
- Error message formatting
- Exhaustion detection

#### `tests/test_retry.py`
Test retry logic:
- Exponential backoff calculation
- Retry attempt limits
- Transient vs permanent error handling

## Electron App Changes

### Files to Modify

#### `electron-app/main.js`
- Add health check before showing UI
- Implement timeout (5 seconds) for backend startup
- Add retry logic (up to 3 attempts with 2-second intervals)
- Graceful error dialog with troubleshooting steps
- Better error logging

#### `electron-app/preload.js`
- Add health check IPC handler
- Better error handling for backend communication

## Summary of Changes

| Category | Files | Impact |
|----------|-------|--------|
| Backend Errors (planned) | 6 new, 5 modified | High - Better reliability |
| Frontend Types (planned) | 3 new, 8 modified | High - Better DX |
| Testing (planned) | 5 new | High - Better confidence |
| Infrastructure (planned) | 2 modified | Medium - Better UX |
| **Total (planned)** | **29 files** | **Pending implementation** |

## Priority Implementation Order

1. **Phase 1 (Core):** errors.py, validators.py, config.py, types.ts
2. **Phase 2 (Backend):** retry.py, cleanup.py, orchestrator.py updates, main.py
3. **Phase 3 (Frontend):** toasts.tsx, ErrorBoundary.tsx, api.ts improvements
4. **Phase 4 (Testing):** All test files
5. **Phase 5 (Polish):** UI components, Electron app

