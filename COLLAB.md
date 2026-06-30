# Two-Claude Collaboration Protocol

This repo is worked on by **two Claude instances** that talk to each other through
**comments on the active GitHub PR** (currently **PR #6**).

## START HERE (Local Claude, cold start)

Do these in order before anything else:

1. **Sync the code:**
   ```powershell
   cd "<path-to-your-local-clone-of-this-repo>"
   git fetch origin
   git checkout claude/youthful-cray-l9yx4c
   git reset --hard origin/claude/youthful-cray-l9yx4c
   ```
2. **Read the project context:** `CLAUDE.md` (full architecture, pipeline, setup) and
   the "Current state / what's next" section below.
3. **Confirm GitHub CLI is ready:** `gh auth status` (you need it to read/post PR
   comments). If not logged in: `gh auth login`.
4. **Read the conversation so far:**
   ```powershell
   gh pr view 6 -R djdistraction/htxpunk-mv-generator --comments
   ```
5. **Do the latest open task** addressed to you and report back (see protocol below).

You are **Local Claude**. Your job is to run/test/build on this Windows PC and report
results. Cloud Claude writes the code and pushes; you are its hands on the real machine.

## The two roles

| | Cloud Claude (Claude Code) | Local Claude (Claude Desktop + Desktop Commander) |
|---|---|---|
| Runs in | a remote Linux cloud container | the owner's Windows PC (local clone of this repo) |
| Can | author code, push to GitHub, read/comment on the PR | run the app, test, build/sign the installer, fix machine-specific issues |
| Cannot | touch the Windows PC, reach `api.cloudflare.com`, run a GUI | hold the full project history a cold start lacks |
| Triggered by | PR comments (delivered as wake events) | the human, or by reading Cloud Claude's PR comments |

Neither Claude can do the other's half. Cloud writes the code; Local runs it on the
real machine.

## How they talk — PR comments only

A **comment on the PR** is the reliable signal that wakes Cloud Claude. Raw pushes and
file edits do **not** reliably generate wake events, so: edit/push freely, but **always
drop a one-line PR comment as the doorbell.**

Comment prefixes (keep them, they make intent unambiguous):

- `REQUEST:` — Local → Cloud. A change/feature to implement. Be specific.
- `RESULT:` — Local → Cloud. What happened running/testing on the PC (paste real
  output/errors verbatim — that's what lets Cloud fix it without guessing).
- `DONE:` — Cloud → Local. Pushed; pull the branch and test. Says what to run.
- `NEED:` — Cloud → Local. A question or decision required before continuing.

### Reading and posting comments (gh CLI)

```powershell
# read the whole thread (newest at the bottom)
gh pr view 6 -R djdistraction/htxpunk-mv-generator --comments

# post back — use a heredoc for multi-line / pasted output
gh pr comment 6 -R djdistraction/htxpunk-mv-generator --body @"
RESULT: ran make_wow_oh_images.py
<paste exact output or error here>
"@
```

Always end a working session by posting a comment — that is the doorbell that wakes
Cloud Claude. No comment = Cloud Claude never sees your push.

## Standard loop

1. Local Claude (driven by the human) posts `REQUEST: …` on the PR.
2. Cloud Claude wakes, implements it, pushes to `claude/youthful-cray-l9yx4c`,
   and comments `DONE: pushed — run X, report back`.
3. Local Claude pulls, runs/tests on the PC, comments `RESULT: …` (success or the
   exact error).
4. Repeat until the feature works on the real machine.

## Running on the PC (Local Claude quick start)

```powershell
cd "C:\Users\booki\HTXpunk LLC\htxpunk-mv-generator"
git fetch origin
git checkout claude/youthful-cray-l9yx4c
git reset --hard origin/claude/youthful-cray-l9yx4c   # match the cloud branch exactly
```

`.env` is **gitignored** and must never be committed. It already exists on the PC with
the working keys. Minimal deps for the storyboard path:

```powershell
pip install requests Pillow sqlalchemy aiosqlite httpx imageio-ffmpeg pydantic-settings python-dotenv
```

Generate stills and view them in the app:
```powershell
cd backend
python make_wow_oh_images.py          # generates 30 frames, stops before video
uvicorn main:app --port 8000          # window A
# window B:  cd ../frontend ; npm install ; npm run dev
# open the storyboard URL the script printed
```

## Current state / what's next

- ✅ Cloudflare Workers AI (FLUX.1-schnell) image backend — verified on owner's account
- ✅ Storyboard frames viewable + manageable (redo / reorder) in the UI
- ⬜ Storyboard → animated video clips (needs a **paid** image-to-video model — decision pending)
- ⬜ One-double-click Windows installer (bundle Python backend + Electron; **Local Claude's job to build/test**)

## Surfaces & routing

The owner orchestrates several Claude surfaces, all coordinated through PR #6:

| Surface | Lane |
|---|---|
| Owner's **phone** (GitHub mobile app) | Posts requests as PR #6 comments from anywhere |
| **Cloud Claude** (this, Claude Code) | Code + GitHub; always-on hub, woken by PR comments |
| **Local Claude** (Claude Desktop + Desktop Commander) | Runs/tests/installs on the Windows PC |
| **Claude for Chrome** | Browser tasks: Cloudflare dashboard, previewing output |

Routing: a request lands as a PR #6 comment. **Cloud Claude triages it** — does the
code/GitHub parts itself; for anything needing the PC or browser, it posts a `NEED:`
comment naming the surface (e.g. `NEED: @local run the installer build` or
`NEED: @chrome open the Cloudflare AI dashboard and confirm the Workers AI quota`).
The Claudes do not talk to each other automatically — PR #6 is the manual relay.

To reach Cloud Claude from a phone: comment on **PR #6** via the GitHub app. (Opening
the Claude app starts a different session, not this one.)

## Secrets hygiene

Never put API keys/tokens in commits, code, or PR comments. Keys live only in the
local `.env` (gitignored). If a secret is ever pasted somewhere tracked, rotate it.
