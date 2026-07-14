# PR + smoke checklist — `cursor/win95-app-shell`

**Branch:** `cursor/win95-app-shell`  
**Base:** `main`  
**Open PR:** https://github.com/djdistraction/htxpunk-mv-generator/compare/main...cursor/win95-app-shell?expand=1

## Suggested PR title

```text
Win95 utility UI + Lyric Video v1 end-to-end path
```

## Suggested PR body

```markdown
## Linked work
- Visual direction from Claude Design (Win95 utility shell)
- Lyric Video v1 (issue #29 path) + guided align-lyrics / non-blocking workers
- Builds on `claude/lyric-video-v1`

## Scope
- App shell: title bar, menus, toolbar, status bar, backend health
- Production workbook sidebar (one stage at a time)
- Native Win95 reskin of major pages (home, new, settings, workbook, treatment, elements, storyboard, production, review, processing)
- Lyric-only render path (Remotion `LyricVideo`, skip cinematic stages for pure lyric projects)
- Confirm-info also approves `song_file` so Generate lyric video unlocks cleanly
- Default new-project path: Lyric Video

## Test steps
1. Checkout `cursor/win95-app-shell`, start app (backend :8000, frontend :3000).
2. Confirm Win95 chrome (teal desktop, grey window, navy title bar, menus).
3. New Project → Lyric Video only → upload a short song.
4. Optional: paste exact lyrics for force-align.
5. Run guided steps: rhythm/key → prepare audio → metadata → vocals → lyrics.
6. Confirm song info (Review).
7. Generate lyric video from workbook Final stage.
8. Production: wait for render, play video, Approve Final.
9. Confirm project stage complete / final export set.

## Intentionally not changed
- Generation algorithms / image backends (except path routing for pure lyric)
- Modal lip-sync spend path
- Full cinematic quality / karaoke word highlighting

## Known limitations
- Karaoke / performance / cinematic still share older cinematic-heavy stages except pure lyric hide/skip
- Manifest page still partially CSS-compat skinned (logic unchanged)
- Real high-quality cinematic MV still needs real video backend + token gates
```

## Human smoke test (do this once before merge)

### Launch
```powershell
cd "C:\Users\booki\HTXpunk LLC\htxpunk-mv-generator"
git checkout cursor/win95-app-shell
git pull
# preferred local path:
py run.py --no-install
# only if you want $0 Ken Burns / placeholder smoke for cinematic:
# py run.py --no-install --allow-preview-video
```

### Pass criteria
- [ ] UI looks like a sturdy Windows 95 utility (not purple SaaS)
- [ ] Backend health shows Connected in toolbar
- [ ] Pure Lyric project hides treatment/elements/storyboard stages
- [ ] After Confirm & Continue, **Generate lyric video** is available without hunting extra approvals
- [ ] Render reaches `base_video_ready` and Production can play + Approve Final
- [ ] No silent “complete” with empty/wrong-duration video

### If something fails
Note: stage name, error banner text, and backend log line. Fix on this branch before Karaoke work.
