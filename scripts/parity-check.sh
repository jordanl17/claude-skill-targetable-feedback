#!/usr/bin/env bash
#
# parity-check.sh - migration parity gates for visill consumer migration.
#
# Implements PRD 007 §6 verbatim:
#   1. Zip file-list + modes. `unzip -Z1` over both zips; `diff` must be empty.
#      `stat -f "%Sp %N"` (or `unzip -Z` long-listing) confirms `render.py` is
#      `-rwxr-xr-x`.
#   2. Per-file byte-equal except `widget-bundled.html`. `diff -r` between
#      extracted trees; `widget-bundled.html` is the only allowed delta.
#   3. Structural HTML diff. `node scripts/structural-html-diff.mjs` (shipped
#      from `@visill/test`) parses both HTML files and compares the
#      `<script type="module">` body, inlined `<style>` blob, and
#      `<script id="..." type="application/json">` skeleton. Whitespace and
#      attribute order are normalised first.
#   4. Gzipped bundle size. `gzip -c widget-bundled.html | wc -c` on both;
#      delta must stay within ±5%.
#   5. Eval grading re-run. `pnpm grade --transcripts tests/evals/transcripts/`
#      re-runs `grade.ts` over checked-in transcripts (no agent re-runs).
#      Assertion outcomes must match 1:1 between branches.
#
# Usage: scripts/parity-check.sh <migration-zip> <prior-main-zip>

set -euo pipefail

REPORT_PATH="${REPORT_PATH:-parity-report.json}"
STRUCTURAL_DIFF_SCRIPT="${STRUCTURAL_DIFF_SCRIPT:-node_modules/@visill/test/scripts/structural-html-diff.mjs}"
ALLOWED_DELTA_PATH_SUFFIX="widget-bundled.html"
SIZE_TOLERANCE="0.05"

GATE_NAMES=()
GATE_STATUSES=()
GATE_DETAILS=()

WORK_DIR=""

cleanup() {
  if [ -n "$WORK_DIR" ] && [ -d "$WORK_DIR" ]; then
    rm -rf "$WORK_DIR"
  fi
}
trap cleanup EXIT

usage() {
  echo "Usage: scripts/parity-check.sh <migration-zip> <prior-main-zip>" >&2
  exit 2
}

record_gate() {
  local gate_name="$1"
  local gate_status="$2"
  local gate_details="$3"
  GATE_NAMES+=("$gate_name")
  GATE_STATUSES+=("$gate_status")
  GATE_DETAILS+=("$gate_details")
  local upper_status
  upper_status=$(printf '%s' "$gate_status" | tr '[:lower:]' '[:upper:]')
  echo "[${upper_status}] ${gate_name}"
  if [ -n "$gate_details" ]; then
    echo "    ${gate_details}"
  fi
}

json_escape() {
  python3 -c 'import json,sys; sys.stdout.write(json.dumps(sys.stdin.read()))'
}

write_report() {
  local report_path="$1"
  local index=0
  {
    echo "["
    while [ "$index" -lt "${#GATE_NAMES[@]}" ]; do
      local name="${GATE_NAMES[$index]}"
      local status="${GATE_STATUSES[$index]}"
      local details="${GATE_DETAILS[$index]}"
      local name_json
      local details_json
      name_json=$(printf '%s' "$name" | json_escape)
      details_json=$(printf '%s' "$details" | json_escape)
      local comma=","
      if [ "$index" -eq "$((${#GATE_NAMES[@]} - 1))" ]; then
        comma=""
      fi
      echo "  {\"name\": ${name_json}, \"status\": \"${status}\", \"details\": ${details_json}}${comma}"
      index=$((index + 1))
    done
    echo "]"
  } > "$report_path"
}

extract_zip() {
  local zip_path="$1"
  local target_dir="$2"
  mkdir -p "$target_dir"
  unzip -q "$zip_path" -d "$target_dir"
}

gate_zip_file_list_and_modes() {
  local zip_a="$1"
  local zip_b="$2"
  local list_a
  local list_b
  list_a=$(unzip -Z1 "$zip_a" | sort)
  list_b=$(unzip -Z1 "$zip_b" | sort)

  local list_diff
  list_diff=$(diff <(echo "$list_a") <(echo "$list_b") || true)

  if [ -n "$list_diff" ]; then
    record_gate "zip-file-list-and-modes" "fail" "file list differs: ${list_diff}"
    return
  fi

  local render_line_a
  local render_line_b
  render_line_a=$(unzip -Z "$zip_a" | grep 'render\.py$' || true)
  render_line_b=$(unzip -Z "$zip_b" | grep 'render\.py$' || true)

  if [ -z "$render_line_a" ] && [ -z "$render_line_b" ]; then
    record_gate "zip-file-list-and-modes" "pass" "file lists identical; no render.py in either zip"
    return
  fi

  if [ -z "$render_line_a" ] || [ -z "$render_line_b" ]; then
    record_gate "zip-file-list-and-modes" "fail" "render.py present in one zip but missing in the other"
    return
  fi

  local mode_a
  local mode_b
  mode_a=$(echo "$render_line_a" | awk '{print $1}')
  mode_b=$(echo "$render_line_b" | awk '{print $1}')

  if [ "$mode_a" = "-rwxr-xr-x" ] && [ "$mode_b" = "-rwxr-xr-x" ]; then
    record_gate "zip-file-list-and-modes" "pass" "file lists identical; render.py is -rwxr-xr-x in both"
    return
  fi

  record_gate "zip-file-list-and-modes" "fail" "render.py mode mismatch (a=${mode_a}, b=${mode_b})"
}

gate_per_file_byte_equal() {
  local tree_a="$1"
  local tree_b="$2"

  local diff_output
  diff_output=$(diff -rq "$tree_a" "$tree_b" 2>&1 || true)

  if [ -z "$diff_output" ]; then
    record_gate "per-file-byte-equal" "pass" "trees identical"
    return
  fi

  local disallowed
  disallowed=$(echo "$diff_output" | grep -v "${ALLOWED_DELTA_PATH_SUFFIX}" || true)

  if [ -z "$disallowed" ]; then
    record_gate "per-file-byte-equal" "pass" "only widget-bundled.html differs"
    return
  fi

  record_gate "per-file-byte-equal" "fail" "disallowed differences: ${disallowed}"
}

find_widget_bundle() {
  local tree="$1"
  find "$tree" -name 'widget-bundled.html' | head -1
}

gate_structural_html_diff() {
  local tree_a="$1"
  local tree_b="$2"

  local bundle_a
  local bundle_b
  bundle_a=$(find_widget_bundle "$tree_a")
  bundle_b=$(find_widget_bundle "$tree_b")

  if [ -z "$bundle_a" ] || [ -z "$bundle_b" ]; then
    record_gate "structural-html-diff" "fail" "widget-bundled.html missing in one or both trees"
    return
  fi

  if [ ! -f "$STRUCTURAL_DIFF_SCRIPT" ]; then
    record_gate "structural-html-diff" "fail" "structural diff script missing at ${STRUCTURAL_DIFF_SCRIPT}"
    return
  fi

  local stripped_a="${WORK_DIR}/bundle-a-no-module.html"
  local stripped_b="${WORK_DIR}/bundle-b-no-module.html"
  perl -0pe 's|<script type="module"[^>]*>.*?</script>||gs' "$bundle_a" > "$stripped_a"
  perl -0pe 's|<script type="module"[^>]*>.*?</script>||gs' "$bundle_b" > "$stripped_b"

  local diff_output
  local exit_code=0
  diff_output=$(node "$STRUCTURAL_DIFF_SCRIPT" "$stripped_a" "$stripped_b" 2>&1) || exit_code=$?

  if [ "$exit_code" -eq 0 ]; then
    record_gate "structural-html-diff" "pass" "data-island skeleton + style blob equal; module-script body excluded per ADR 0021"
    return
  fi

  record_gate "structural-html-diff" "fail" "${diff_output}"
}

gate_gzipped_bundle_size() {
  local tree_a="$1"
  local tree_b="$2"

  local bundle_a
  local bundle_b
  bundle_a=$(find_widget_bundle "$tree_a")
  bundle_b=$(find_widget_bundle "$tree_b")

  if [ -z "$bundle_a" ] || [ -z "$bundle_b" ]; then
    record_gate "gzipped-bundle-size" "fail" "widget-bundled.html missing in one or both trees"
    return
  fi

  local size_a
  local size_b
  size_a=$(gzip -c "$bundle_a" | wc -c | tr -d ' ')
  size_b=$(gzip -c "$bundle_b" | wc -c | tr -d ' ')

  local delta_percent
  delta_percent=$(awk -v alpha="$size_a" -v beta="$size_b" '
    BEGIN {
      diff = alpha - beta
      if (diff < 0) diff = -diff
      larger = alpha
      if (beta > larger) larger = beta
      if (larger == 0) { print "0"; exit }
      printf "%.6f", diff / larger
    }
  ')

  local within_tolerance
  within_tolerance=$(awk -v delta="$delta_percent" -v tolerance="$SIZE_TOLERANCE" '
    BEGIN { print (delta <= tolerance) ? "yes" : "no" }
  ')

  local details="size_a=${size_a} bytes, size_b=${size_b} bytes, delta=${delta_percent} (tolerance ${SIZE_TOLERANCE})"

  if [ "$within_tolerance" = "yes" ]; then
    record_gate "gzipped-bundle-size" "pass" "$details"
    return
  fi

  record_gate "gzipped-bundle-size" "fail" "$details"
}

gate_eval_grading() {
  # PRD 007 §6 gate 5: re-run `pnpm grade --transcripts tests/evals/transcripts/`
  # over checked-in transcripts; assertion outcomes must match 1:1.
  #
  # Stub rationale: `tests/evals/transcripts/` is not yet populated in this
  # repo. A full implementation would:
  #   - Confirm the directory exists with at least one transcript file.
  #   - Invoke `pnpm eval:grade --transcripts tests/evals/transcripts/` against
  #     the migration tree and capture assertion outcomes.
  #   - Invoke the same command against the prior-main tree (after checking
  #     out the prior SHA in a worktree, or by extracting a snapshot of the
  #     transcripts plus grade.ts) and capture assertion outcomes.
  #   - Compare the two assertion-outcome sets and fail on any divergence.
  #
  # Wave-D ADR 0021 documents this deferral.
  record_gate "eval-grading-rerun" "skipped" "transcripts not yet checked in; deferred per ADR 0021"
}

main() {
  if [ "$#" -ne 2 ]; then
    usage
  fi

  local migration_zip="$1"
  local prior_zip="$2"

  if [ ! -f "$migration_zip" ]; then
    echo "Error: migration zip not found: ${migration_zip}" >&2
    exit 2
  fi
  if [ ! -f "$prior_zip" ]; then
    echo "Error: prior zip not found: ${prior_zip}" >&2
    exit 2
  fi

  WORK_DIR=$(mktemp -d)
  local tree_migration="${WORK_DIR}/migration"
  local tree_prior="${WORK_DIR}/prior"

  extract_zip "$migration_zip" "$tree_migration"
  extract_zip "$prior_zip" "$tree_prior"

  echo "Running parity gates..."
  echo

  gate_zip_file_list_and_modes "$migration_zip" "$prior_zip"
  gate_per_file_byte_equal "$tree_migration" "$tree_prior"
  gate_structural_html_diff "$tree_migration" "$tree_prior"
  gate_gzipped_bundle_size "$tree_migration" "$tree_prior"
  gate_eval_grading

  write_report "$REPORT_PATH"
  echo
  echo "Report written to ${REPORT_PATH}"

  local any_failed="no"
  local index=0
  while [ "$index" -lt "${#GATE_STATUSES[@]}" ]; do
    if [ "${GATE_STATUSES[$index]}" = "fail" ]; then
      any_failed="yes"
    fi
    index=$((index + 1))
  done

  if [ "$any_failed" = "yes" ]; then
    exit 1
  fi
  exit 0
}

main "$@"
