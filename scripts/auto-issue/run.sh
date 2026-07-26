#!/usr/bin/env bash
#
# run.sh — Autonomous GitHub-issue implementation pipeline for garment-erp.
#
# Walks open issues in ascending number order (skipping the tracking issue #32) and, for each,
# spawns a fresh headless Claude Code agent (subscription auth) inside an isolated git worktree.
# The agent follows playbook.md: plan -> branch -> implement -> test -> PR -> auto-merge when green
# -> close. This script is a thin loop: preflight, enumerate, route model, launch, log, next.
#
# Model routing (model-routing skill): each issue maps to a COMPLETE OpenSpec spec, so implementation
# is Sonnet-tier by default (routine, spec-complete, lint/test-caught). Hard issues — the `api`
# Nest-module ones (auth/RBAC/guards, transactions, business rules, >5 files, costly correctness) —
# route to Opus. A Sonnet issue that FAILS is retried once on Opus (escalate-on-second-attempt).
# No Fable: the design/thinking work already lives in the OpenSpec proposals.
#
# Usage:
#   ./run.sh [COUNT] [options]
#
# Arguments:
#   COUNT                Number of issues to run sequentially (a bare positive integer).
#                        Equivalent to --limit COUNT. Omit to run the whole queue.
#
# Options:
#   --dry-run            List the issues that would be processed and print the exact claude
#                        invocation, but launch nothing.
#   --only N             Process only issue N.
#   --from N             Start from issue N (inclusive); skip lower-numbered issues.
#   --limit K            Process at most K issues (same as the positional COUNT).
#   --label L            Only issues carrying label L (repeatable).
#   --skip N             Additionally skip issue N (repeatable; #32 is always skipped).
#   --stop-on-fail       Halt the loop on the first non-success issue (default: continue).
#   --model M            Force one model for every issue (alias/id, e.g. opus|sonnet); disables routing.
#   --no-escalate        Do not retry a failed default-model issue on the hard model.
#   -h, --help           Show this help.
#
# Environment:
#   IMPL_MODEL_DEFAULT  Model for routine issues (default: sonnet)
#   IMPL_MODEL_HARD     Model for hard issues + failure escalation (default: opus)
#   MODEL               Back-compat: if set, forces one model (same as --model).
#   ISSUE_TIMEOUT       Per-issue wall-clock cap in seconds (default: 7200)
#   KEEP_WORKTREES      If 1, keep worktrees after a failed issue for debugging (default: remove)
#   RUNS_DIR            Where to write logs/state/worktrees (default: <scriptdir>/.runs)
#
set -uo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd)"
PLAYBOOK="$SCRIPT_DIR/playbook.md"

# Model routing (see header). Aliases resolve to the current latest of each tier.
IMPL_MODEL_DEFAULT="${IMPL_MODEL_DEFAULT:-sonnet}"
IMPL_MODEL_HARD="${IMPL_MODEL_HARD:-opus}"
FORCE_MODEL="${MODEL:-}"   # MODEL env (back-compat) forces a single model; --model overrides it
ESCALATE=1

ISSUE_TIMEOUT="${ISSUE_TIMEOUT:-7200}"
RUNS_DIR="${RUNS_DIR:-$SCRIPT_DIR/.runs}"
TRACKING_ISSUE=32

DRY_RUN=0
ONLY=""
FROM=""
LIMIT=""
STOP_ON_FAIL=0
HALT_REASON=""   # set by run_issue when a subscription session/usage limit is detected
LAST_STATUS=""   # final status of the most recent run_issue (used for escalation decisions)
LABELS=()
EXTRA_SKIPS=()

# ---------- pretty printing ----------
if [[ -t 1 ]]; then
  C_RESET=$'\033[0m'; C_DIM=$'\033[2m'; C_BOLD=$'\033[1m'
  C_GREEN=$'\033[32m'; C_RED=$'\033[31m'; C_YELLOW=$'\033[33m'; C_CYAN=$'\033[36m'
else
  C_RESET=""; C_DIM=""; C_BOLD=""; C_GREEN=""; C_RED=""; C_YELLOW=""; C_CYAN=""
fi
log()  { printf '%s[run]%s %s\n' "$C_CYAN" "$C_RESET" "$*"; }
warn() { printf '%s[run]%s %s\n' "$C_YELLOW" "$C_RESET" "$*" >&2; }
die()  { printf '%s[run] ERROR:%s %s\n' "$C_RED" "$C_RESET" "$*" >&2; exit 1; }

usage() { sed -n '3,42p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; exit 0; }

# ---------- arg parsing ----------
while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run)      DRY_RUN=1; shift ;;
    --only)         ONLY="${2:?--only needs a number}"; shift 2 ;;
    --from)         FROM="${2:?--from needs a number}"; shift 2 ;;
    --limit)        LIMIT="${2:?--limit needs a number}"; shift 2 ;;
    --label)        LABELS+=("${2:?--label needs a value}"); shift 2 ;;
    --skip)         EXTRA_SKIPS+=("${2:?--skip needs a number}"); shift 2 ;;
    --stop-on-fail) STOP_ON_FAIL=1; shift ;;
    --model)        FORCE_MODEL="${2:?--model needs a value}"; shift 2 ;;
    --no-escalate)  ESCALATE=0; shift ;;
    -h|--help)      usage ;;
    -*)             die "unknown option: $1 (use --help)" ;;
    *)              # bare positive integer = COUNT (number of issues to run sequentially)
                    [[ "$1" =~ ^[1-9][0-9]*$ ]] || die "unexpected argument: $1 (COUNT must be a positive integer; use --help)"
                    LIMIT="$1"; shift ;;
  esac
done

# ---------- preflight ----------
preflight() {
  for bin in claude gh git jq timeout pnpm; do
    command -v "$bin" >/dev/null 2>&1 || die "'$bin' not found on PATH"
  done
  [[ -f "$PLAYBOOK" ]] || die "playbook not found: $PLAYBOOK"
  git rev-parse --is-inside-work-tree >/dev/null 2>&1 || die "not inside a git repository"
  gh auth status >/dev/null 2>&1 || die "gh is not authenticated (run: gh auth login)"

  # Force subscription billing, not an API key.
  if [[ -n "${ANTHROPIC_API_KEY:-}" ]]; then
    warn "unsetting ANTHROPIC_API_KEY so headless claude uses your subscription session"
    unset ANTHROPIC_API_KEY
  fi

  REPO_ROOT="$(git rev-parse --show-toplevel)"
  log "repo: $(gh repo view --json nameWithOwner -q .nameWithOwner 2>/dev/null || echo '?')"
  log "fetching origin ..."
  git -C "$REPO_ROOT" fetch --quiet origin || die "git fetch origin failed"
}

# ---------- issue enumeration ----------
enumerate_issues() {
  local args=(issue list --state open --limit 300 --json number)
  local l
  for l in "${LABELS[@]:-}"; do
    [[ -n "$l" ]] && args+=(--label "$l")
  done
  gh "${args[@]}" --jq 'map(.number) | sort | .[]'
}

is_skipped() {
  local n="$1"
  [[ "$n" == "$TRACKING_ISSUE" ]] && return 0
  local s
  for s in "${EXTRA_SKIPS[@]:-}"; do
    [[ -n "$s" && "$n" == "$s" ]] && return 0
  done
  return 1
}

# ---------- model routing (model-routing skill) ----------
# Prints "model<TAB>reason" for an issue. Hard (Opus) = `api` Nest-module issues; everything else is
# routine (Sonnet), which the failure-escalation path can still bump to Opus. --model/MODEL forces one.
route_issue() {
  local n="$1"
  if [[ -n "$FORCE_MODEL" ]]; then
    printf '%s\tforced (--model/MODEL)\n' "$FORCE_MODEL"; return
  fi
  local labels title
  { IFS= read -r labels; IFS= read -r title; } < <(
    gh issue view "$n" --json labels,title -q '(.labels|map(.name)|join(",")), .title' 2>/dev/null
  )
  if grep -qiE '(^|,)api(,|$)' <<<"$labels" || grep -qiE 'nest[ -]?module' <<<"$title"; then
    printf '%s\thard: Nest module (auth/tx/business rules, >5 files)\n' "$IMPL_MODEL_HARD"
  else
    printf '%s\troutine: spec-complete [%s]\n' "$IMPL_MODEL_DEFAULT" "${labels:-no-labels}"
  fi
}

# ---------- state ----------
STATE_FILE=""
CURRENT_FILE=""
set_state() { # issue status branch pr model
  printf '%s\t%s\t%s\t%s\t%s\t%s\n' "$1" "$2" "${5:-}" "$3" "${4:-}" "$(date -u +%FT%TZ)" >>"$STATE_FILE"
}

# ---------- per-issue runner ----------
run_issue() {
  local n="$1" model="$2" reason="${3:-}"
  local branch="auto/issue-${n}"
  local wt="$RUN_DIR/worktrees/issue-${n}"
  local jsonl="$RUN_DIR/issue-${n}.jsonl"
  local exitf="$RUN_DIR/issue-${n}.exit"

  echo "$n" >"$CURRENT_FILE"
  log "${C_BOLD}issue #$n${C_RESET} -> branch $branch  ${C_DIM}[model: ${model}${reason:+ · $reason}]${C_RESET}"
  set_state "$n" running "$branch" "" "$model"

  # Refresh origin/main so this issue branches from the LATEST main — including PRs merged by
  # earlier issues in this same run. Without this, origin/main is stale and each issue would start
  # from the commit that was current when the run began.
  git -C "$REPO_ROOT" fetch --quiet origin main \
    || warn "issue #$n: git fetch failed; branching from possibly-stale origin/main"
  log "issue #$n: base origin/main @ $(git -C "$REPO_ROOT" rev-parse --short origin/main 2>/dev/null || echo '?')"

  # Fresh isolated worktree off origin/main; never disturbs the main checkout.
  git -C "$REPO_ROOT" worktree add -B "$branch" "$wt" origin/main >/dev/null 2>&1 \
    || { warn "issue #$n: worktree add failed"; set_state "$n" failed "$branch" "" "$model"; return 1; }

  # A fresh worktree has no node_modules (gitignored). Pre-install (best-effort, warm store =
  # mostly hardlinks) so the agent doesn't spend turns on it; the playbook tells it to retry if needed.
  log "issue #$n: installing deps in worktree ..."
  ( cd "$wt" && pnpm install --frozen-lockfile --prefer-offline ) \
    >"$RUN_DIR/issue-${n}.install.log" 2>&1 \
    || warn "issue #$n: pnpm install non-zero (see issue-${n}.install.log; agent will retry)"

  local prompt="Work GitHub issue #$n to completion now, following the playbook. When finished, print the final RESULT line."
  local rc=0
  (
    cd "$wt" || exit 97
    timeout "$ISSUE_TIMEOUT" \
      claude -p "$prompt" \
        --model "$model" \
        --dangerously-skip-permissions \
        --append-system-prompt "$(cat "$PLAYBOOK")" \
        --output-format stream-json --verbose
  ) 2>&1 | tee "$jsonl"
  rc=${PIPESTATUS[0]}

  # Extract the agent's final RESULT line (from the stream-json 'result' event or any RESULT text).
  local result_line status pr
  # -R + fromjson? tolerates stderr lines merged into the transcript (2>&1 above).
  result_line="$(jq -rR 'fromjson? | select(.type=="result") | .result // empty' "$jsonl" 2>/dev/null | tail -1)"
  [[ -z "$result_line" ]] && result_line="$(grep -aoE 'RESULT issue=[0-9]+ pr=[^ ]* status=[a-z-]+' "$jsonl" | tail -1)"
  printf 'exit=%s\n%s\n' "$rc" "$result_line" >"$exitf"

  status="$(sed -n 's/.*status=\([a-z-]*\).*/\1/p' <<<"$result_line" | tail -1)"
  pr="$(sed -n 's/.*pr=\([^ ]*\).*/\1/p' <<<"$result_line" | tail -1)"
  if [[ $rc -eq 124 ]]; then status="timeout"; fi
  [[ -z "$status" ]] && status=$([[ $rc -eq 0 ]] && echo "unknown" || echo "failed")
  # If the agent didn't report a PR, try to find one for the branch.
  [[ -z "$pr" || "$pr" == "" ]] && pr="$(gh pr list --head "$branch" --json url -q '.[0].url' 2>/dev/null || true)"

  # Detect a Claude subscription session/usage-limit stop. Such a limit persists until it resets, so
  # every later issue in this run would fail identically — cascading the whole queue to 'failed' for
  # no work. When we see the signature, mark this issue rate-limited and signal the loop to HALT.
  local limit_line
  limit_line="$(grep -aoiE "hit your (session|usage) limit[^\"]*|(session|usage) limit reached[^\"]*|limit .{0,20}resets[^\"]*" "$jsonl" 2>/dev/null | head -1)"
  if [[ -n "$limit_line" ]]; then
    status="rate-limited"
    HALT_REASON="$(echo "$limit_line" | tr -d '\r' | cut -c1-120)"
  fi

  set_state "$n" "$status" "$branch" "$pr" "$model"
  case "$status" in
    merged)          log "issue #$n ${C_GREEN}merged${C_RESET} ($pr)";;
    pr-open|blocked) warn "issue #$n status=$status ($pr)";;
    timeout)         warn "issue #$n ${C_RED}timed out${C_RESET} after ${ISSUE_TIMEOUT}s";;
    rate-limited)    warn "issue #$n ${C_RED}session/usage limit hit${C_RESET} — ${HALT_REASON}";;
    *)               warn "issue #$n ${C_RED}status=$status${C_RESET} (exit $rc)";;
  esac

  # Cleanup worktree (keep on non-success if requested for debugging).
  if [[ "$status" == "merged" || "${KEEP_WORKTREES:-0}" != "1" ]]; then
    git -C "$REPO_ROOT" worktree remove --force "$wt" >/dev/null 2>&1 || true
  else
    warn "keeping worktree for inspection: $wt"
  fi

  echo "idle" >"$CURRENT_FILE"
  LAST_STATUS="$status"
  case "$status" in
    merged)       return 0 ;;
    rate-limited) return 2 ;;   # signal the loop to halt the whole run
    *)            return 1 ;;
  esac
}

# ---------- main ----------
main() {
  preflight

  mapfile -t ALL < <(enumerate_issues)
  [[ ${#ALL[@]} -gt 0 ]] || die "no open issues found"

  # Apply scope filters.
  local queue=() n
  for n in "${ALL[@]}"; do
    is_skipped "$n" && continue
    [[ -n "$ONLY" && "$n" != "$ONLY" ]] && continue
    [[ -n "$FROM" && "$n" -lt "$FROM" ]] && continue
    queue+=("$n")
  done
  if [[ -n "$LIMIT" ]]; then queue=("${queue[@]:0:$LIMIT}"); fi
  [[ ${#queue[@]} -gt 0 ]] || die "no issues match the given scope"

  log "queue (${#queue[@]}): ${queue[*]}"
  if [[ -n "$FORCE_MODEL" ]]; then
    log "model=$FORCE_MODEL ${C_DIM}(forced — routing disabled)${C_RESET}  timeout=${ISSUE_TIMEOUT}s  skipping #$TRACKING_ISSUE${EXTRA_SKIPS:+ + ${EXTRA_SKIPS[*]}}"
  else
    log "routing: default=${IMPL_MODEL_DEFAULT} hard=${IMPL_MODEL_HARD} escalate=$([[ $ESCALATE -eq 1 ]] && echo on || echo off)  timeout=${ISSUE_TIMEOUT}s  skipping #$TRACKING_ISSUE${EXTRA_SKIPS:+ + ${EXTRA_SKIPS[*]}}"
  fi

  if [[ $DRY_RUN -eq 1 ]]; then
    log "${C_BOLD}--dry-run${C_RESET}: routed model per issue (launching nothing):"
    local mr m r
    for n in "${queue[@]}"; do
      mr="$(route_issue "$n")"; m="${mr%%$'\t'*}"; r="${mr#*$'\t'}"
      printf '   #%-4s %-8s %s\n' "$n" "$m" "$r"
    done
    exit 0
  fi

  # Establish the run directory + latest symlink.
  local ts; ts="$(date -u +%Y%m%dT%H%M%SZ)"
  RUN_DIR="$RUNS_DIR/$ts"
  mkdir -p "$RUN_DIR/worktrees"
  ln -sfn "$ts" "$RUNS_DIR/latest"
  STATE_FILE="$RUN_DIR/state.tsv"
  CURRENT_FILE="$RUN_DIR/current"
  printf 'issue\tstatus\tmodel\tbranch\tpr\tupdated\n' >"$STATE_FILE"
  echo "idle" >"$CURRENT_FILE"
  log "run dir: $RUN_DIR  (monitor with: $SCRIPT_DIR/monitor.sh)"

  local ok=0 bad=0 halted=0 mr model reason
  for n in "${queue[@]}"; do
    mr="$(route_issue "$n")"; model="${mr%%$'\t'*}"; reason="${mr#*$'\t'}"
    run_issue "$n" "$model" "$reason"; local irc=$?

    # Escalate to the hard model once (model-routing: "escalate on the second failed attempt").
    # Only for a genuine implementation failure on the DEFAULT model — not blocked (missing
    # dependency, Opus can't help), timeout (Opus isn't faster), or rate-limited (whole run halts).
    if [[ $irc -eq 1 && $ESCALATE -eq 1 && -z "$FORCE_MODEL" \
          && "$model" == "$IMPL_MODEL_DEFAULT" && "$IMPL_MODEL_DEFAULT" != "$IMPL_MODEL_HARD" \
          && ( "$LAST_STATUS" == "failed" || "$LAST_STATUS" == "pr-open" || "$LAST_STATUS" == "unknown" ) ]]; then
      warn "issue #$n ${C_YELLOW}$LAST_STATUS${C_RESET} on $IMPL_MODEL_DEFAULT — escalating to $IMPL_MODEL_HARD"
      run_issue "$n" "$IMPL_MODEL_HARD" "escalated after $LAST_STATUS on $IMPL_MODEL_DEFAULT"; irc=$?
    fi

    case $irc in
      0) ok=$((ok+1)) ;;
      2) halted=1
         warn "${C_BOLD}halting run${C_RESET}: ${HALT_REASON:-session/usage limit reached}."
         warn "no work is lost — merged issues are closed; re-run later and it resumes at the next open issue:"
         warn "    $0 --from $n"
         break ;;
      *) bad=$((bad+1))
         if [[ $STOP_ON_FAIL -eq 1 ]]; then warn "--stop-on-fail: halting after issue #$n"; break; fi ;;
    esac
  done

  echo "done" >"$CURRENT_FILE"
  printf '\n%s==== summary ====%s\n' "$C_BOLD" "$C_RESET"
  column -t -s $'\t' "$STATE_FILE" | awk 'NR==1{print;next}{last[$1]=$0} END{for(k in last) print last[k]}' \
    | sort -n | sed "s/merged/${C_GREEN}merged${C_RESET}/; s/failed/${C_RED}failed${C_RESET}/"
  log "merged=$ok  not-merged=$bad  (details: $RUN_DIR)"
  [[ $halted -eq 1 ]] && warn "run halted early on a session/usage limit — resume with: $0 --from <next-open-issue>"
}

main "$@"
