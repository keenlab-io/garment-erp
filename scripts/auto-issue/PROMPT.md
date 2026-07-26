# Origin prompt — autonomous issue-implementation pipeline

The prompts that produced `scripts/auto-issue/` (`run.sh`, `playbook.md`, `monitor.sh`, `README.md`).

## Original prompt

> Write a bash script to invoke headless claude code agent with Opus 4.8 model authenticated by
> Claude subscription. Write a playbook instruct the following procedure:
>
> 1. In plan mode, explore opened Github issues in https://github.com/keenlab-io/garment-erp/issues
>    in order of item number, except for issue #32 which is issue tracking issue. Map the next issue
>    to OpenSpec task. Plan the implementation.
> 2. In main or master branch, create a new feature branch.
> 3. Use code-implementation skill to implement code in auto mode.
> 4. Run tests after implementation and iteratively fix until all tests pass
> 5. Commit and push
> 6. Open an auto-merge PR/MR. Only merge if all check pass. Iteratively, fix and commit fix until
>    all check pass.
> 7. Close issue and move to the next issue
>
> Also write a monitoring script to monitor current work and Claude responses.

## Refinements (later prompts)

1. **"let the run script take the number of issues to run sequentially"**
   → added the positional `COUNT` argument (`run.sh 5` = run 5 issues; alias for `--limit`).
2. **"the run doesn't pull main branch before working on next issue"**
   → `run_issue` now does `git fetch origin main` before each worktree, so every issue branches from
   the latest `origin/main` (including PRs merged earlier in the same run).
3. **"during actual implementation we also use Opus that is expensive — use the model-routing skill to
   determine the proper model before implementation"**
   → per-issue model routing: **Sonnet** by default (spec-complete work), **Opus** for `api`
   Nest-module issues, and Sonnet→Opus **escalation** on a genuine failure. No Fable (specs already
   exist). See `run.sh` `route_issue()` and the README "Model routing" section.

## Decisions made during design (confirmed with the user)

- **Permission mode:** full bypass (`--dangerously-skip-permissions`) — required for unattended
  edits/commits/`gh`; blast radius contained to a per-issue git worktree.
- **Loop model:** one fresh headless `claude` process per issue, bash owns the loop.
- **Issue scope:** all open issues ascending, skipping the tracking issue **#32**.
- **Merge gate:** auto-merge (squash) when all checks pass; never force-merge a red PR.

## Operational notes learned in practice

- The pipeline **self-resumes**: it only queues *open* issues and closes them on merge, so a plain
  re-run (or `--from N`) continues where it left off.
- A Claude **session/usage limit** mid-run halts the whole run cleanly (detected from the transcript)
  instead of cascading every remaining issue to `failed`.
- **Stopping a run:** kill `run.sh` first (so it can't spawn the next issue), then the `timeout`/
  `claude` agent; remove the interrupted issue's worktree + `auto/issue-<N>` branch so a later resume
  isn't blocked by "already checked out".
