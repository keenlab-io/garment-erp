# Playbook — Autonomous GitHub-issue implementation (garment-erp)

You are a **headless, unattended** Claude Code agent. No human will approve prompts or answer
questions. You are launched once per GitHub issue with a task message naming the issue number.
Drive that single issue to completion by following the steps below, then emit the final RESULT line
and stop. Do not start work on any other issue.

You run inside a **dedicated git worktree** already checked out on branch `auto/issue-<N>` from a
fresh `origin/main`. Your current working directory is that worktree. Stay in it.

---

## Repository context (obey — CI and reviewers enforce these)

- pnpm + Turborepo monorepo. Node ≥ 22, pnpm 9. Full **ESM**: relative imports in `.ts` need explicit
  `.js` extensions; import `Decimal` as a **named** import from `decimal.js`.
- **`@erp/contracts` is the source of truth.** Change a shape/endpoint there first, then implement in
  `apps/api` and consume in `apps/web`. `@erp/contracts` stays framework-agnostic (only `zod` /
  `@ts-rest/core` / `@erp/utils`).
- **`apps/web` and `apps/api` never import each other** — communicate only through `@erp/contracts`.
  ESLint fails CI if violated.
- **Money & quantity cross the wire as strings**, never floats. Use `@erp/utils` decimal helpers
  (`lineTotal`, `sumMoney`, `formatMoney`, `asMoney`, `asQty`).
- Frontend design system: semantic design tokens only (raw hex and `--ink-*`/`--cyan-*`/`--magenta-*`/
  `--substrate-*` primitive vars are lint-banned in style strings). `antd` is banned workspace-wide.
- Verify commands (run from repo root): `pnpm build`, `pnpm typecheck`, `pnpm lint`, `pnpm test`.
  Read `CLAUDE.md` for the full conventions before implementing.
- **Gotcha**: typecheck uses `tsc --noEmit` (not `--build`). If `tsc`/`nest build` emits too few files
  after a config change, clear stale artifacts: `find . -name '*.tsbuildinfo' -delete` and remove `dist/`.

## Guardrails (hard rules)

- **Never force-merge a red PR.** Merge only when all required checks pass.
- **Never touch `main` directly** and never merge other people's branches.
- Keep changes **scoped to this issue's tasks**. Do not do unrelated refactors.
- If the issue is **blocked** (its OpenSpec change can't be found, or it depends on a contract/module
  that doesn't exist yet), do **not** fake it: comment on the issue explaining the blocker, then emit
  `RESULT issue=<N> pr= status=blocked` and stop.
- If, after your bounded fix attempts, checks still fail, leave the PR **open** with an explanatory
  comment and emit `status=pr-open`. Do not close the issue.

---

## Step 1 — Plan (read-only first)

1. Read the issue: `gh issue view <N> --json number,title,body,labels`.
2. The title is `M<k> <Module> · <section>` (or a backend title). The body's `Source:` footer links to
   the OpenSpec change's `tasks.md`, e.g. `openspec/changes/m1-iam-frontend/tasks.md`. Derive the
   change dir and the matching `## <section>` block. If the body has no Source link, infer the change
   dir from the milestone label (`M1..M6`) + `frontend`/backend nature and the section title.
3. The issue body's checkboxes (`- [ ] 3.1 …`) **are your task list** — they are copied verbatim from
   that `tasks.md` section.
4. Read `proposal.md`, `design.md`, and the relevant `specs/*/spec.md` in that change dir for intent
   and acceptance scenarios. Skim `CLAUDE.md` for conventions touching these files.
5. Write a short implementation plan (a few bullets: files to add/change, contracts impact, tests).
   Then proceed — no approval needed.

## Step 2 — Branch

You are already on `auto/issue-<N>` off `origin/main`. Confirm with `git status`/`git branch --show-current`.
If for some reason you are not, create it: `git fetch origin && git switch -c auto/issue-<N> origin/main`.

## Step 3 — Implement

- Invoke the **code-implementation skill in auto mode** and implement the section's checkbox tasks.
- Follow the repo conventions above; match the style of surrounding code; add/adjust unit tests.
- In the change's `tasks.md`, flip the completed items in this section from `- [ ]` to `- [x]` so the
  OpenSpec tracking stays in sync (only the items you actually completed).

## Step 4 — Test (iterate until green locally)

Run, from the repo root of the worktree, and fix failures until all pass:

```
pnpm build && pnpm typecheck && pnpm lint
pnpm test
```

Dependencies were pre-installed into this worktree. If you hit a missing-module or "command not
found" error, run `pnpm install --frozen-lockfile` once and retry before assuming a real failure.

- Affected-only is fine; you don't need the whole graph if unaffected.
- Integration tests that need Docker/Postgres self-skip without `DATABASE_URL_TEST` — that mirrors the
  CI `verify` job; don't try to stand up Docker.
- If typecheck emits too few files after config edits, clear `*.tsbuildinfo` and `dist/` (see gotcha).

## Step 5 — Commit & push

- Stage your changes. Use a **conventional-commit** subject, scoped, e.g.
  `feat(web): M1 IAM routes, i18n & nav wiring (#<N>)`.
- End the commit message body with the trailer (exactly):
  ```
  Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
  ```
- Push: `git push -u --force-with-lease origin auto/issue-<N>`. (`--force-with-lease` is safe here and
  lets a re-run of this same issue — e.g. an orchestrator model escalation — update the branch cleanly.)

## Step 6 — Open PR + auto-merge, then watch checks

1. Create the PR against `main`, closing the issue on merge — **or update the existing one**. This
   issue may be re-run (the orchestrator escalates a failed attempt to a stronger model), so a PR for
   `auto/issue-<N>` may already exist. Check first and don't error:
   ```
   pr="$(gh pr list --head auto/issue-<N> --state open --json number -q '.[0].number')"
   if [ -z "$pr" ]; then
     gh pr create --base main --head auto/issue-<N> \
       --title "<same conventional-commit subject>" \
       --body "$(printf 'Implements the tasks in #%s.\n\n<one-paragraph summary>\n\nCloses #%s\n\n🤖 Generated with [Claude Code](https://claude.com/claude-code)' <N> <N>)"
   fi
   ```
   (When the PR already exists, your force-pushed commits from Step 5 have already updated it.)
2. Enable auto-merge (squash): `gh pr merge <pr> --squash --auto`.
   - If the repo has auto-merge **disabled** (command errors), fall back to poll-then-merge: watch
     checks (below) and, once green, run `gh pr merge <pr> --squash`.
3. Watch the checks to completion: `gh pr checks <pr> --watch --interval 30`.
   - Required check contexts are **`verify`** and **`integration`**.
   - On failure: inspect with `gh run view --log-failed` (or `gh pr checks <pr>` for the run URL),
     reproduce and fix locally, re-run the Step 4 commands, commit the fix, `git push`, and
     `gh pr checks <pr> --watch` again.
   - **Bounded**: at most **4** fix attempts. If still red after that, comment on the PR + issue with
     the failing summary, leave the PR open, and emit `status=pr-open`.

## Step 7 — Close & report

- When the PR is **merged green**, the `Closes #<N>` closes the issue automatically. Idempotently
  ensure it: `gh issue close <N> --comment "Done in <pr-url>."` (ignore "already closed").
- Emit exactly one final line so the orchestrator can record the outcome:
  ```
  RESULT issue=<N> pr=<pr-url> status=<merged|pr-open|blocked>
  ```
