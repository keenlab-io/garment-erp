# auto-issue — autonomous GitHub-issue → PR pipeline

Drives a headless Claude Code agent (Opus 4.8, **subscription** auth) through the open issue backlog
of this repo. For each open issue (ascending number, skipping the tracking issue **#32**) it runs the
full lifecycle in an **isolated git worktree**:

> plan → branch → implement (code-implementation skill, auto) → test → commit/push → PR →
> auto-merge **when checks are green** → close → next issue.

Each issue maps 1:1 to a `## N.` section of an OpenSpec change's `tasks.md`; the agent reads that
section (and the change's `proposal.md`/`design.md`/`specs/`) to know what to build.

## Files

| File          | Purpose                                                                        |
|---------------|--------------------------------------------------------------------------------|
| `run.sh`      | Orchestrator: preflight → enumerate issues → worktree + launch `claude` → log. |
| `playbook.md` | The 7-step procedure, passed to every agent via `--append-system-prompt`.      |
| `monitor.sh`  | Live dashboard + transcript tail.                                              |
| `.runs/`      | Runtime logs, `state.tsv`, per-issue transcripts, worktrees (gitignored).      |

## Prerequisites

- `claude` logged in interactively at least once (`claude` → sign in with your Claude subscription).
  `run.sh` unsets `ANTHROPIC_API_KEY` so billing uses the **subscription session**, not an API key.
- `gh` authenticated (`gh auth status`), plus `git`, `jq`, `timeout` on PATH.
- Run from anywhere inside the repo.

## Usage

```bash
# See what would run — prints the ascending issue list (32 absent) and the exact claude command.
scripts/auto-issue/run.sh --dry-run

# Safe first run: a single issue, end to end.
scripts/auto-issue/run.sh --only 53

# Run the next N issues from the queue sequentially (bare positive integer = COUNT).
scripts/auto-issue/run.sh 3            # first 3 open issues (skipping #32)
scripts/auto-issue/run.sh 5 --from 53  # 5 issues starting at #53

# Watch it (separate terminal).
scripts/auto-issue/monitor.sh          # dashboard
scripts/auto-issue/monitor.sh tail     # live transcript of the active agent

# Full backlog (all open issues ascending, skip #32).
scripts/auto-issue/run.sh

# Scope controls.
scripts/auto-issue/run.sh --from 53 --limit 5     # 5 issues starting at #53
scripts/auto-issue/run.sh --label frontend        # only 'frontend'-labelled issues
scripts/auto-issue/run.sh --skip 40 --skip 41     # extra skips (beyond #32)
scripts/auto-issue/run.sh --stop-on-fail          # halt on first non-merged issue

# Model routing.
scripts/auto-issue/run.sh --dry-run               # shows the routed model + reason per issue
scripts/auto-issue/run.sh --model opus            # force Opus for everything (old behavior)
scripts/auto-issue/run.sh --no-escalate           # don't retry a failed Sonnet issue on Opus
```

### Model routing (cost control)

Applying the **model-routing** skill: each issue maps to a **complete OpenSpec spec** (proposal +
design + tasks + delta specs), so implementation is Sonnet-tier by default. Only the genuinely hard
issues run on Opus.

| Tier | Model (alias) | Which issues | Why |
|---|---|---|---|
| Routine | **`sonnet`** (default) | `contracts`, `tests`, `db-schema`, all `frontend` | Spec-complete, pattern-following, lint/test-caught |
| Hard | **`opus`** | `api` **Nest-module** issues | Auth/RBAC/guards, transactions, business rules, >5 files, costly correctness |
| Escalation | `sonnet` → `opus` | any routine issue that **fails** | model-routing's "escalate on the second attempt" |

No **Fable**: the design/thinking work already lives in the OpenSpec proposals, so there's nothing to
draft. `--dry-run` prints the decision for every queued issue before you commit to a run. Routing is
by issue label/title (`route_issue`); `--model M` forces one model and disables routing entirely.

### Environment knobs

| Var                  | Default            | Meaning                                              |
|----------------------|--------------------|------------------------------------------------------|
| `IMPL_MODEL_DEFAULT` | `sonnet`           | Model for routine issues.                            |
| `IMPL_MODEL_HARD`    | `opus`             | Model for hard issues + failure escalation.          |
| `MODEL`              | unset              | Back-compat: if set, forces one model (like `--model`). |
| `ISSUE_TIMEOUT`      | `7200`             | Per-issue wall-clock cap (seconds).                  |
| `KEEP_WORKTREES`     | unset              | `1` keeps worktrees after a failed issue.            |
| `RUNS_DIR`           | `<scriptdir>/.runs`| Where logs/state/worktrees are written.              |

## What the monitor shows

- **Dashboard**: `merged X/total`, a per-issue status table (`running`/`merged`/`pr-open`/`blocked`/
  `failed`/`timeout`), the active issue's PR URL + `gh pr checks`, and the last ~12 lines of agent
  activity (assistant text + `› tool(...)` calls) parsed from the stream-json transcript.
- **`tail`**: a live follow of the active agent's transcript through the same formatter.
- **`log <N>`**: pretty-print a finished issue's full transcript.

## Safety model

- **Isolated worktrees** off `origin/main` — the main checkout (and these scripts) is never reset or
  disturbed. Sequential, one issue at a time.
- The agent **never force-merges a red PR**. If checks stay red after its bounded fix attempts, the PR
  is left **open** with an explanatory comment and the loop moves on (`status=pr-open`).
- **Blocked** issues (unmappable, or missing an upstream dependency) get a comment and are skipped
  (`status=blocked`) rather than faked.
- Uses `--dangerously-skip-permissions` (required for unattended edits/commits/`gh`); blast radius is
  contained to the per-issue worktree and its branch/PR.

## Not committed by default

These scripts are created in the working tree but not committed (repo convention: commit only when
asked). Committing `scripts/auto-issue/` to `main` is the natural follow-up if you want them versioned.
`.runs/` is gitignored.
