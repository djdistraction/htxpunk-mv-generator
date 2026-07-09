# Agent Collaboration Rules

This repository may be edited by multiple AI coding agents and human maintainers, including Claude Code, Codex, GitHub Copilot, Cursor, and Randall.

The repo is the traffic-control tower. Agents must follow the same workflow so they do not overwrite each other, duplicate work, or silently change product direction.

## Primary rule

Do not work directly on `main`.

All work must happen on a dedicated branch tied to a GitHub issue, pull request, or clearly documented task.

## Required reading before changing code

Before writing code, every agent must read:

1. `README.md`
2. `AGENTS.md`
3. `docs/agent-handoff.md`
4. `docs/decision-log.md`
5. `docs/production-workbook-implementation-plan.md`
6. the GitHub issue or PR assigned to the work

If any file is missing, create or update it as part of the first setup task before making product changes.

## Required workflow

1. Check the current branch.
2. Check open PRs and active issues.
3. Confirm the assigned scope.
4. Create or use a dedicated branch for exactly one issue, phase, or task.
5. Keep changes narrow and reviewable.
6. Avoid unrelated formatting churn.
7. Do not rewrite unrelated files.
8. Do not change generation algorithms unless the issue explicitly asks for it.
9. Do not introduce silent fallbacks.
10. Do not spend image/video generation tokens in tests.
11. Prefer explicit failure over fake successful output.
12. Update docs when changing workflow behavior.
13. Add a short implementation summary to the PR or issue.
14. Leave a handoff note if stopping before the task is complete.

## Branch naming

Use branch prefixes that show who owns the work.

Examples:

- `claude/20-workbook-shell-plan`
- `claude/27-shot-manifest-design`
- `codex/20-workbook-shell`
- `codex/23-section-state`
- `copilot/30-preflight-checks`
- `cursor/fix-local-windows-launch`
- `human/test-pr19-local`

Do not have two agents push to the same branch at the same time unless Randall explicitly asks for that.

## Tool lanes

### Claude Code

Use Claude Code primarily for:

- architecture review
- long-context repo analysis
- file-by-file implementation planning
- data model design
- refactor strategy
- risk identification
- PR review before implementation

Recommended Claude Code prompt style:

```text
Read AGENTS.md, docs/agent-handoff.md, docs/decision-log.md, and docs/production-workbook-implementation-plan.md.

Do not write code yet.

Produce a file-by-file implementation plan for the assigned issue. Include risks, files likely touched, and what should not be changed.
```

### Codex

Use Codex primarily for:

- controlled implementation PRs
- issue execution
- incremental refactors
- backend endpoint work
- frontend integration work
- tests and validation patches
- patch iteration after review

Recommended Codex prompt style:

```text
Read AGENTS.md and docs/production-workbook-implementation-plan.md.

Implement only the assigned phase or issue.
Keep the PR narrow.
Do not change generation algorithms unless explicitly requested.
Add test steps or validation notes.
```

### GitHub Copilot

Use GitHub Copilot primarily for:

- small scoped code edits inside the editor
- autocomplete and boilerplate
- local refactors already planned by Claude Code or Codex
- test helpers
- UI component extraction
- TypeScript/Python cleanup
- repetitive wiring after the architecture is decided

GitHub Copilot must not be used as an unchecked project-wide rewrite tool.

When using Copilot:

- keep edits scoped to the current branch and issue
- review every suggested diff manually
- do not accept bulk rewrites without reading them
- do not let Copilot alter unrelated files
- do not let Copilot reformat files outside the assigned task
- ensure Copilot-generated behavior follows the product decisions in `docs/decision-log.md`

### Cursor

Use Cursor primarily for:

- local Windows testing
- quick repo inspection
- debugging runtime errors
- fixing import/path issues
- manual frontend tweaks while the app is running
- validating UI behavior on Randall's machine

Cursor should follow the same branch and PR rules as every other tool.

### Human maintainer

Randall is the final product owner.

Human review should verify:

- the app still launches locally
- generated files are not deleted accidentally
- token-spending behavior is explicit
- workflow gates match the intended production process
- user-facing language is clear and accurate

## Commit rules

Use small, descriptive commits.

Good examples:

- `Add workbook section status model`
- `Render locked workbook sections`
- `Add base video preflight check`
- `Document optional lip sync workflow`

Bad examples:

- `update`
- `fix stuff`
- `massive rewrite`
- `changes`

## Pull request rules

Every PR must include:

- linked issue
- scope of change
- files changed summary
- test steps
- known limitations
- what was intentionally not changed
- screenshots if UI changed, when practical

Keep PRs small.

Preferred size:

- small PR: 1 to 4 files
- normal PR: 5 to 8 files
- large PR: 9 to 12 files
- anything larger should be split unless Randall explicitly approves

## Handoff notes

If an agent stops mid-task, it must leave a note in the PR or issue using this template:

```markdown
## Agent Handoff

### Work completed

- ...

### Files changed

- ...

### Decisions made

- ...

### Known risks

- ...

### Not completed

- ...

### Recommended next step

- ...
```

## Conflict prevention

Before editing, check whether another open PR touches the same files.

Avoid concurrent edits to these high-conflict files unless coordinated:

- `frontend/app/projects/[id]/ProjectDetail.tsx`
- `frontend/lib/api.ts`
- `backend/api/projects.py`
- `backend/workers/pipeline_worker.py`
- `backend/database.py`
- `backend/services/video_assembler.py`
- `backend/services/image_generator.py`
- `backend/config.py`

## Product principles

The app is a production workbook, not a hidden generator tunnel.

The user must be able to:

- inspect each stage
- edit generated results
- approve before continuing
- retry or regenerate one stage at a time
- stop before costly downstream generation
- avoid fake fallback output

## Non-negotiable product decisions

- Ken Burns / ffmpeg slideshow output must only run when explicitly requested as preview mode.
- If real video generation is unavailable, fail clearly before spending image/video tokens.
- Lip sync is optional post-processing after base video approval.
- Store base video and lip-synced video separately.
- Failed optional steps must not overwrite approved prior outputs.
- Element images are a visible approval gate before storyboarding.
- Storyboard images are a visible approval gate before video generation.
- Project completion only happens after a final output is selected.

## Safety and cost controls

Do not run paid/API image or video generation in tests unless Randall explicitly requests it.

Use placeholder mode only for local smoke tests.

Show token or compute cost warnings before image generation, video generation, and lip sync.

Prefer stopping with a clear error over generating unusable output.
