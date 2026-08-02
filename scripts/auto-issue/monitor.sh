#!/usr/bin/env bash
#
# monitor.sh — live view of the autonomous issue pipeline started by run.sh.
#
# Usage:
#   ./monitor.sh              Dashboard: progress table + active issue + PR checks + recent agent output
#   ./monitor.sh tail         Follow the current agent's transcript (assistant text + tool calls)
#   ./monitor.sh log <N>      Pretty-print the full transcript for issue N
#   ./monitor.sh <file.jsonl> Pretty-print an arbitrary stream-json transcript (for testing the formatter)
#
# Environment:
#   RUNS_DIR   Root of run artifacts (default: <scriptdir>/.runs)
#   INTERVAL   Dashboard refresh seconds (default: 5)
#
set -uo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd)"
RUNS_DIR="${RUNS_DIR:-$SCRIPT_DIR/.runs}"
INTERVAL="${INTERVAL:-5}"

if [[ -t 1 ]]; then
  C_RESET=$'\033[0m'; C_DIM=$'\033[2m'; C_BOLD=$'\033[1m'
  C_GREEN=$'\033[32m'; C_RED=$'\033[31m'; C_YELLOW=$'\033[33m'; C_CYAN=$'\033[36m'; C_MAG=$'\033[35m'
else
  C_RESET=""; C_DIM=""; C_BOLD=""; C_GREEN=""; C_RED=""; C_YELLOW=""; C_CYAN=""; C_MAG=""
fi

die() { printf 'monitor: %s\n' "$*" >&2; exit 1; }

run_dir() {
  local latest="$RUNS_DIR/latest"
  [[ -e "$latest" ]] || die "no run found at $RUNS_DIR/latest (has run.sh started?)"
  printf '%s\n' "$(cd "$latest" && pwd -P)"
}

# jq program: render one assistant/user/result event as a readable line.
# assistant text -> plain; tool_use -> "> tool(name)"; tool_result -> dim "< result";
# result event -> the final summary.
read -r -d '' JQ_FMT <<'JQ' || true
def clip($s): ($s // "") | gsub("\n";" ") | if length > 300 then .[0:300] + "…" else . end;
fromjson? |
if .type == "assistant" then
  (.message.content[]? |
    if .type == "text" and ((.text // "") | gsub("\\s";"") | length) > 0 then clip(.text)
    elif .type == "tool_use" then "  [36m› " + .name + "[0m(" + (clip(.input.command // .input.file_path // .input.description // "")) + ")"
    else empty end)
elif .type == "user" then
  (.message.content[]? | select(.type=="tool_result") |
    "  [2m‹ " + (clip((.content[]?.text) // (.content|tostring))) + "[0m")
elif .type == "result" then
  "[1m■ result:[0m " + clip(.result // (.subtype // "done"))
else empty end
JQ

# -R reads each line as a raw string; fromjson? (inside JQ_FMT) tolerates non-JSON lines
# (stderr merged into the transcript) instead of aborting at the first bad line.
fmt_stream() { jq -rR --unbuffered "$JQ_FMT" 2>/dev/null; }

current_issue() {
  local rd="$1"
  [[ -f "$rd/current" ]] && cat "$rd/current" || echo "?"
}

dashboard() {
  local rd; rd="$(run_dir)"
  while true; do
    local cur; cur="$(current_issue "$rd")"
    clear
    printf '%s╭─ auto-issue pipeline ─ %s ─%s\n' "$C_BOLD" "$(basename "$rd")" "$C_RESET"

    # Progress table (last status per issue).
    if [[ -f "$rd/state.tsv" ]]; then
      local total done_
      total=$(awk 'NR>1{a[$1]}END{print length(a)}' "$rd/state.tsv")
      done_=$(awk -F'\t' 'NR>1 && $2=="merged"{a[$1]}END{print length(a)}' "$rd/state.tsv")
      printf '%s│%s merged %s%s/%s%s\n' "$C_DIM" "$C_RESET" "$C_GREEN" "${done_:-0}" "${total:-0}" "$C_RESET"
      awk -F'\t' 'NR>1{last[$1]=$0} END{for(k in last) print last[k]}' "$rd/state.tsv" \
        | sort -n \
        | while IFS=$'\t' read -r issue status model branch pr updated; do
            local col="$C_RESET"
            case "$status" in
              merged) col="$C_GREEN";; running) col="$C_CYAN";;
              pr-open|blocked) col="$C_YELLOW";; failed|timeout|rate-limited) col="$C_RED";;
            esac
            printf '   #%-4s %s%-9s%s %-7s %-20s %s\n' "$issue" "$col" "$status" "$C_RESET" "${model:-?}" "$branch" "${C_DIM}${pr}${C_RESET}"
          done
    fi

    printf '%s├─ active: %s%s\n' "$C_DIM" "$C_RESET" "$([[ "$cur" =~ ^[0-9]+$ ]] && echo "#$cur" || echo "$cur")"

    # PR checks for the active issue, if any.
    if [[ "$cur" =~ ^[0-9]+$ ]]; then
      local pr
      pr="$(gh pr list --head "auto/issue-$cur" --json url -q '.[0].url' 2>/dev/null || true)"
      if [[ -n "$pr" ]]; then
        printf '%s│  PR: %s%s\n' "$C_DIM" "$C_RESET" "$pr"
        gh pr checks "auto/issue-$cur" 2>/dev/null | awk -F'\t' '{printf "   %s %s\n",$2,$1}' | head -6
      fi
      # Last few lines of agent activity.
      local jsonl="$rd/issue-$cur.jsonl"
      if [[ -f "$jsonl" ]]; then
        printf '%s├─ recent agent output ─%s\n' "$C_DIM" "$C_RESET"
        tail -n 40 "$jsonl" | fmt_stream | grep -v '^$' | tail -n 12
      fi
    fi

    printf '%s╰─ refresh %ss · Ctrl-C to exit · `%s tail` for live stream%s\n' \
      "$C_DIM" "$INTERVAL" "$(basename "$0")" "$C_RESET"
    sleep "$INTERVAL"
  done
}

follow() {
  local rd; rd="$(run_dir)"
  local cur; cur="$(current_issue "$rd")"
  [[ "$cur" =~ ^[0-9]+$ ]] || die "no active issue to follow (current=$cur)"
  local jsonl="$rd/issue-$cur.jsonl"
  printf '%s── following issue #%s ── %s%s\n' "$C_BOLD" "$cur" "$jsonl" "$C_RESET"
  tail -n +1 -f "$jsonl" | fmt_stream
}

print_log() {
  local target="$1" rd jsonl
  if [[ -f "$target" ]]; then jsonl="$target"
  else rd="$(run_dir)"; jsonl="$rd/issue-$target.jsonl"; fi
  [[ -f "$jsonl" ]] || die "transcript not found: $jsonl"
  fmt_stream <"$jsonl"
}

command -v jq >/dev/null 2>&1 || die "'jq' is required"
case "${1:-dash}" in
  dash|dashboard|"") dashboard ;;
  tail|follow)       follow ;;
  log)               print_log "${2:?usage: monitor.sh log <N>}" ;;
  *.jsonl)           print_log "$1" ;;
  *)                 die "unknown command: $1 (dash | tail | log <N> | <file.jsonl>)" ;;
esac
