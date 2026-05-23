"""Grade each run's outputs against assertions. Writes grading.json per run.

Usage:
    python3 tests/evals/grade.py <iteration-dir>

Example:
    python3 tests/evals/grade.py targetable-feedback-workspace/iteration-2
"""

import argparse
import json
import re
from pathlib import Path

# evals.json lives next to this script and defines scenario IDs + prompts
EVALS_JSON_PATH = Path(__file__).parent / "evals.json"


def load_text(path):
    return path.read_text() if path.exists() else ""


def load_meta(run_dir):
    meta_path = run_dir / "outputs" / "meta.json"
    if not meta_path.exists():
        return {}
    try:
        return json.loads(meta_path.read_text())
    except json.JSONDecodeError:
        return {}


def count_top_level_units(html):
    """Count top-level .unit divs (not sub-units, not nested under another unit)."""
    soup_text = html
    units = re.findall(r'<div\s+class="[^"]*\bunit\b[^"]*"[^>]*>', soup_text)
    sub_units = re.findall(r'<div\s+class="[^"]*\bsub-unit\b[^"]*"[^>]*>', soup_text)
    return len(units) - len(sub_units)


def count_subunits(html):
    return len(re.findall(r'<div\s+class="[^"]*\bsub-unit\b[^"]*"[^>]*>', html))


def extract_data_ids(html):
    """Extract data-id values from .unit div elements only (skip script literals)."""
    pattern = r'<div\s+class="[^"]*\bunit\b[^"]*"[^>]*\bdata-id="([^"]+)"'
    return re.findall(pattern, html)


def assertion(text, passed, evidence=""):
    return {"text": text, "passed": passed, "evidence": evidence}


def grade_trigger_generative_fires(run_dir):
    meta = load_meta(run_dir)
    widget = load_text(run_dir / "outputs" / "widget.html")
    response = load_text(run_dir / "outputs" / "response.md")
    return [
        assertion(
            "activated_meta_true: meta.json has activated=true",
            meta.get("activated") is True,
            f"meta.activated={meta.get('activated')!r}",
        ),
        assertion(
            "widget_html_present: widget.html exists and contains unit divs",
            '<div class="unit' in widget or "class=\"unit" in widget,
            f"widget length={len(widget)}",
        ),
        assertion(
            "min_5_units: widget contains at least 5 top-level .unit divs",
            count_top_level_units(widget) >= 5,
            f"top-level units={count_top_level_units(widget)}",
        ),
        assertion(
            "no_duplicate_prose: response.md does not embed the full RFC prose outside the widget",
            len(response) < 2000,
            f"response.md length={len(response)}",
        ),
    ]


def grade_trigger_single_edit_skips(run_dir, is_baseline=False):
    meta = load_meta(run_dir)
    widget_path = run_dir / "outputs" / "widget.html"
    widget = load_text(widget_path)
    response = load_text(run_dir / "outputs" / "response.md")
    asserts = []
    if not is_baseline:
        asserts.append(
            assertion(
                "activated_meta_false: meta.json has activated=false",
                meta.get("activated") is False,
                f"meta.activated={meta.get('activated')!r}",
            )
        )
    asserts.extend(
        [
            assertion(
                "no_widget_html: no widget unit divs produced",
                "class=\"unit" not in widget,
                f"widget contains unit div: {'class=\"unit' in widget}",
            ),
            assertion(
                "edit_applied: response contains 'within 24 hours'",
                "within 24 hours" in response,
                "checked response.md",
            ),
            assertion(
                "other_bullets_present: response still contains PagerDuty, war-room, and 48 hours",
                all(token in response for token in ["PagerDuty", "war-room", "48 hours"]),
                "checked response.md",
            ),
        ]
    )
    return asserts


def grade_trigger_code_task_skips(run_dir, is_baseline=False):
    meta = load_meta(run_dir)
    widget = load_text(run_dir / "outputs" / "widget.html")
    response = load_text(run_dir / "outputs" / "response.md")
    asserts = []
    if not is_baseline:
        asserts.append(
            assertion(
                "activated_meta_false: meta.json has activated=false",
                meta.get("activated") is False,
                f"meta.activated={meta.get('activated')!r}",
            )
        )
    asserts.extend(
        [
            assertion(
                "no_widget_html: no widget unit divs produced",
                "class=\"unit" not in widget,
                f"widget produced: {bool(widget)}",
            ),
            assertion(
                "function_present: response contains 'def dedupe_preserving_order'",
                "def dedupe_preserving_order" in response,
                "",
            ),
            assertion(
                "docstring_present: response contains triple-quoted docstring",
                '"""' in response,
                "",
            ),
        ]
    )
    return asserts


VERBATIM_EXACT_PARAS = [
    "Acme Notebook 2026 is our most ambitious release yet. We are redefining what a notebook can be for everyday work.",
    "Built for the modern knowledge worker, Acme Notebook 2026 brings a clean, focused writing experience that adapts to how you actually think.",
    "Three new features: smart linking between notes, an AI-powered outline view, and seamless mobile sync that just works.",
    "Whether you are a writer, a researcher, or a student, you will feel at home from the first page. Acme Notebook 2026 is designed for everyone who thinks in writing.",
    "Available March 15th on web, desktop, and mobile. Sign up at acme.com to be the first to know.",
]


def grade_verbatim_exact_prose(run_dir, is_baseline=False):
    meta = load_meta(run_dir)
    widget = load_text(run_dir / "outputs" / "widget.html")
    response = load_text(run_dir / "outputs" / "response.md")
    # baseline writes everything to response.md (no widget.html), so check both
    haystack = widget + "\n" + response
    asserts = []
    if not is_baseline:
        asserts.append(
            assertion(
                "activated_meta_true: meta.json has activated=true",
                meta.get("activated") is True,
                f"meta.activated={meta.get('activated')!r}",
            )
        )
        asserts.append(
            assertion(
                "exactly_5_units: widget.html contains exactly 5 top-level .unit divs",
                count_top_level_units(widget) == 5,
                f"top-level units={count_top_level_units(widget)}",
            )
        )
        asserts.append(
            assertion(
                "data_ids_sequential: widget data-ids are 1,2,3,4,5",
                extract_data_ids(widget) == ["1", "2", "3", "4", "5"],
                f"data-ids={extract_data_ids(widget)}",
            )
        )
    for index, paragraph in enumerate(VERBATIM_EXACT_PARAS, start=1):
        asserts.append(
            assertion(
                f"para{index}_verbatim: output contains paragraph {index} byte-for-byte",
                paragraph in haystack,
                "" if paragraph in haystack else f"missing: {paragraph[:60]}...",
            )
        )
    return asserts


AWKWARD_GOALS = [
    "Goal 1: reduce time. Reducing time good.",
    "Goal 2: ship the thing that ships. We ship it by Q3.",
    "Goal 3: customers happy or sad? Make them happy. Survey says it.",
    "Goal 4: monies in. Monies up. Track in dashboard which we build.",
    "Goal 5: team happy too. Not just customers. Both.",
]


def grade_verbatim_awkward_phrasing(run_dir, is_baseline=False):
    meta = load_meta(run_dir)
    widget = load_text(run_dir / "outputs" / "widget.html")
    response = load_text(run_dir / "outputs" / "response.md")
    haystack = widget + "\n" + response
    asserts = []
    if not is_baseline:
        asserts.append(
            assertion(
                "activated_meta_true",
                meta.get("activated") is True,
                f"meta.activated={meta.get('activated')!r}",
            )
        )
        asserts.append(
            assertion(
                "exactly_5_units",
                count_top_level_units(widget) == 5,
                f"top-level units={count_top_level_units(widget)}",
            )
        )
    for index, goal in enumerate(AWKWARD_GOALS, start=1):
        asserts.append(
            assertion(
                f"awkward{index}_preserved",
                goal in haystack,
                "" if goal in haystack else f"missing: {goal[:60]}...",
            )
        )
    # Negative: should NOT contain "improved" rewrites
    smell_words = ["increase revenue", "customer satisfaction", "team satisfaction", "track revenue"]
    leaked = [word for word in smell_words if word.lower() in haystack.lower()]
    asserts.append(
        assertion(
            "no_improvement_smell: no 'improved' rephrasing detected",
            len(leaked) == 0,
            f"leaked: {leaked}" if leaked else "",
        )
    )
    return asserts


SUBUNIT_PARENT_TEXTS = [
    "Reduce p95 API latency",
    "Cut deploy time below 5 minutes",
    "Improve on-call experience",
]

SUBUNIT_CHILD_TEXTS = [
    "Profile the slowest 10 endpoints and find the worst offenders.",
    "Migrate session lookups off Postgres onto Redis.",
    "Add request-coalescing to the user-profile endpoint.",
    "Parallelize the integration test suite across 4 runners.",
    "Cache pnpm install between CI jobs.",
    "Audit every page that fired last quarter and tag the actionable vs noise.",
    "Write three new runbooks for the most-common pages.",
    "Rotate secondary on-call weekly instead of monthly.",
]


def grade_subunits(run_dir, is_baseline=False):
    meta = load_meta(run_dir)
    widget = load_text(run_dir / "outputs" / "widget.html")
    response = load_text(run_dir / "outputs" / "response.md")
    haystack = widget + "\n" + response
    asserts = []
    if not is_baseline:
        asserts.append(
            assertion(
                "activated_meta_true",
                meta.get("activated") is True,
                f"meta.activated={meta.get('activated')!r}",
            )
        )
        asserts.append(
            assertion(
                "three_top_level_parents: exactly 3 top-level units",
                count_top_level_units(widget) == 3,
                f"top-level units={count_top_level_units(widget)}",
            )
        )
        data_ids = extract_data_ids(widget)
        top_level_ids = [data_id for data_id in data_ids if "." not in data_id]
        sub_level_ids = [data_id for data_id in data_ids if "." in data_id]
        asserts.append(
            assertion(
                "top_level_ids_sequential: top-level ids are 1, 2, 3",
                top_level_ids == ["1", "2", "3"],
                f"top-level ids={top_level_ids}",
            )
        )
        asserts.append(
            assertion(
                "dot_notation_subunit_ids: sub-unit ids use dot notation",
                len(sub_level_ids) >= 6 and all(re.match(r"^\d+\.\d+$", data_id) for data_id in sub_level_ids),
                f"sub-level ids={sub_level_ids}",
            )
        )
        asserts.append(
            assertion(
                "no_3_level_nesting: no ids with two dots",
                all(data_id.count(".") <= 1 for data_id in data_ids),
                f"ids with 2+ dots: {[data_id for data_id in data_ids if data_id.count('.') > 1]}",
            )
        )
    for parent_text in SUBUNIT_PARENT_TEXTS:
        asserts.append(
            assertion(
                f"parent_present: '{parent_text[:40]}...'",
                parent_text in haystack,
                "" if parent_text in haystack else "missing",
            )
        )
    missing_children = [text for text in SUBUNIT_CHILD_TEXTS if text not in haystack]
    asserts.append(
        assertion(
            "all_8_subunit_texts_present",
            len(missing_children) == 0,
            f"missing {len(missing_children)}: {[child[:40] for child in missing_children]}" if missing_children else "",
        )
    )
    return asserts


def grade_removal_renumbers(run_dir, is_baseline=False):
    widget = load_text(run_dir / "outputs" / "widget.html")
    response = load_text(run_dir / "outputs" / "response.md")
    haystack = widget + "\n" + response
    asserts = []
    if not is_baseline:
        asserts.append(
            assertion(
                "exactly_4_units: widget has exactly 4 top-level units",
                count_top_level_units(widget) == 4,
                f"top-level units={count_top_level_units(widget)}",
            )
        )
        asserts.append(
            assertion(
                "data_ids_compact: data-ids are 1,2,3,4 (no gaps)",
                extract_data_ids(widget) == ["1", "2", "3", "4"],
                f"data-ids={extract_data_ids(widget)}",
            )
        )
        asserts.append(
            assertion(
                "rev_pill_present: widget has rev-pill span",
                "rev-pill" in widget,
                "",
            )
        )
    # Removed content should be gone
    removed_phrases = ["Three new features", "smart linking", "AI outline view", "mobile sync"]
    leaked = [phrase for phrase in removed_phrases if phrase in haystack]
    asserts.append(
        assertion(
            "removed_content_absent: removed unit's words don't appear in output",
            len(leaked) == 0,
            f"leaked: {leaked}" if leaked else "",
        )
    )
    # Remaining content should be present
    remaining_phrases = [
        "Acme Notebook 2026 is our most ambitious release yet",
        "Built for the modern knowledge worker",
        "Whether you are a writer or a student",
        "Available March 15th on web, desktop, and mobile",
    ]
    missing = [phrase for phrase in remaining_phrases if phrase not in haystack]
    asserts.append(
        assertion(
            "other_units_present: units 1, 2, 4, 5 still appear verbatim",
            len(missing) == 0,
            f"missing: {missing}" if missing else "",
        )
    )
    return asserts


def grade_removal_subtree(run_dir, is_baseline=False):
    widget = load_text(run_dir / "outputs" / "widget.html")
    response = load_text(run_dir / "outputs" / "response.md")
    haystack = widget + "\n" + response
    asserts = []
    if not is_baseline:
        asserts.append(
            assertion(
                "two_top_level_parents: exactly 2 top-level units",
                count_top_level_units(widget) == 2,
                f"top-level units={count_top_level_units(widget)}",
            )
        )
        asserts.append(
            assertion(
                "four_subunits: exactly 4 sub-units",
                count_subunits(widget) == 4,
                f"sub-units={count_subunits(widget)}",
            )
        )
        sub_ids = sorted([data_id for data_id in extract_data_ids(widget) if "." in data_id])
        asserts.append(
            assertion(
                "subunit_ids_renumbered: sub-ids are 1.1,1.2,2.1,2.2 (no 3.x)",
                sub_ids == ["1.1", "1.2", "2.1", "2.2"],
                f"sub-ids={sub_ids}",
            )
        )
    removed_phrases = ["Cut deploy time", "Parallelize test suite", "Cache pnpm install"]
    leaked = [phrase for phrase in removed_phrases if phrase in haystack]
    asserts.append(
        assertion(
            "removed_subtree_absent: parent and sub-units all gone",
            len(leaked) == 0,
            f"leaked: {leaked}" if leaked else "",
        )
    )
    remaining_phrases = ["Reduce p95 API latency", "Improve on-call experience", "Profile slow endpoints", "Audit recent pages"]
    missing = [phrase for phrase in remaining_phrases if phrase not in haystack]
    asserts.append(
        assertion(
            "remaining_subtrees_present",
            len(missing) == 0,
            f"missing: {missing}" if missing else "",
        )
    )
    return asserts


MIXED_SHAPES_INTRO_PARAGRAPHS = [
    "We're targeting March 15th for the public launch. This brief captures where we are across the workstreams that gate the date.",
    "The work splits into three areas: product polish, marketing readiness, and ops/SRE. Each is on track but has 2-3 specific items that still need close attention. The biggest risk right now is the mobile sync feature - it's the only workstream where slipping the scope is still on the table.",
]

MIXED_SHAPES_BULLET_PARENTS = [
    "Mobile sync reliability under poor network conditions",
    "Pricing page localization",
    "Support readiness",
]

MIXED_SHAPES_SUBBULLETS = [
    "The current retry logic stalls if the device loses connection mid-sync rather than backing off cleanly.",
    "Conflict resolution on offline edits hasn't been tested with realistic multi-device timelines.",
    "Battery impact on iOS is 2x what we expected; needs profiling before launch.",
    "German and Japanese translations are returned but not reviewed.",
    "The annual-vs-monthly toggle layout breaks below 380px in Safari.",
    "Three of our six support agents haven't completed the product training yet.",
    "The shared inbox is missing rules to route AI-feature questions to the right specialist.",
]

MIXED_SHAPES_CLOSING_PARAGRAPH = "The core sync, search, and AI outline features are done. Marketing site copy is approved. The press embargo lifts at 9am ET on launch day. The CDN warmup runbook has been rehearsed twice."


def grade_mixed_shapes(run_dir, is_baseline=False):
    meta = load_meta(run_dir)
    widget = load_text(run_dir / "outputs" / "widget.html")
    response = load_text(run_dir / "outputs" / "response.md")
    haystack = widget + "\n" + response
    asserts = []
    if not is_baseline:
        asserts.append(
            assertion(
                "activated_meta_true",
                meta.get("activated") is True,
                f"meta.activated={meta.get('activated')!r}",
            )
        )
        # Headings present as <h3> section separators
        has_open_risks_h3 = bool(re.search(r"<h3[^>]*>\s*Open risks\s*</h3>", widget))
        has_locked_h3 = bool(re.search(r"<h3[^>]*>\s*What['’]s locked\s*</h3>", widget))
        asserts.append(
            assertion(
                "headings_as_h3: 'Open risks' and 'What's locked' rendered as <h3>",
                has_open_risks_h3 and has_locked_h3,
                f"Open risks h3={has_open_risks_h3}, What's locked h3={has_locked_h3}",
            )
        )
        # Headings not inside .unit divs
        unit_text = " ".join(re.findall(r'<div\s+class="[^"]*\bunit\b[^"]*"[^>]*>([^<]+)', widget))
        headings_leaked_into_units = "Open risks" in unit_text or "What's locked" in unit_text or "What’s locked" in unit_text
        asserts.append(
            assertion(
                "headings_not_units: heading text does not appear inside any .unit div",
                not headings_leaked_into_units,
                "heading text leaked into a unit div" if headings_leaked_into_units else "",
            )
        )
        # Total top-level units = 6
        top_level_count = count_top_level_units(widget)
        asserts.append(
            assertion(
                "total_6_top_level_units: 2 intro + 3 bullet parents + 1 closing",
                top_level_count == 6,
                f"top-level units={top_level_count}",
            )
        )
        # Bullet parents count
        bullet_parents = re.findall(
            r'<div\s+class="[^"]*\bunit\b[^"]*\bbullet\b[^"]*"[^>]*>',
            widget,
        )
        # Filter out sub-unit ones (sub-unit class may also have bullet)
        bullet_parents_top = [match for match in bullet_parents if "sub-unit" not in match]
        asserts.append(
            assertion(
                "bullet_parents_present: 3 top-level bullet units",
                len(bullet_parents_top) == 3,
                f"top-level bullet units={len(bullet_parents_top)}",
            )
        )
        # Sub-units count = 7
        sub_count = count_subunits(widget)
        asserts.append(
            assertion(
                "subunits_count_7: 3+2+2 sub-units under bullet parents",
                sub_count == 7,
                f"sub-units={sub_count}",
            )
        )
    # Verbatim checks (apply regardless - baseline still echoes prose sometimes)
    for index, paragraph in enumerate(MIXED_SHAPES_INTRO_PARAGRAPHS, start=1):
        asserts.append(
            assertion(
                f"intro_para_{index}_verbatim",
                paragraph in haystack,
                "" if paragraph in haystack else f"missing: {paragraph[:60]}...",
            )
        )
    missing_parents = [parent for parent in MIXED_SHAPES_BULLET_PARENTS if parent not in haystack]
    asserts.append(
        assertion(
            "bullet_parents_verbatim: all 3 parent headings present byte-for-byte",
            len(missing_parents) == 0,
            f"missing: {missing_parents}" if missing_parents else "",
        )
    )
    missing_subs = [text for text in MIXED_SHAPES_SUBBULLETS if text not in haystack]
    asserts.append(
        assertion(
            "subbullets_verbatim: all 7 sub-bullets present byte-for-byte",
            len(missing_subs) == 0,
            f"missing {len(missing_subs)}: {[text[:40] for text in missing_subs]}" if missing_subs else "",
        )
    )
    asserts.append(
        assertion(
            "closing_para_verbatim",
            MIXED_SHAPES_CLOSING_PARAGRAPH in haystack,
            "" if MIXED_SHAPES_CLOSING_PARAGRAPH in haystack else "missing closing paragraph",
        )
    )
    return asserts


GRADERS = {
    "trigger-generative-fires": grade_trigger_generative_fires,
    "trigger-single-edit-skips": grade_trigger_single_edit_skips,
    "trigger-code-task-skips": grade_trigger_code_task_skips,
    "verbatim-exact-prose": grade_verbatim_exact_prose,
    "verbatim-awkward-phrasing": grade_verbatim_awkward_phrasing,
    "subunits-2-level-nesting": grade_subunits,
    "removal-renumbers-siblings": grade_removal_renumbers,
    "removal-subtree-on-parent": grade_removal_subtree,
    "mixed-shapes-document": grade_mixed_shapes,
}


def grade_run(eval_name, run_dir, is_baseline):
    grader = GRADERS[eval_name]
    # trigger-generative-fires baseline: no skill, so baseline never "activates". Skip activated assertion.
    if eval_name == "trigger-generative-fires" and is_baseline:
        widget = load_text(run_dir / "outputs" / "widget.html")
        response = load_text(run_dir / "outputs" / "response.md")
        expectations = [
            assertion("widget_html_present", "class=\"unit" in widget, f"widget contains unit div: {'class=\"unit' in widget}"),
            assertion("min_5_units", count_top_level_units(widget) >= 5, f"top-level units={count_top_level_units(widget)}"),
            assertion("no_duplicate_prose", len(response) < 2000, f"response.md length={len(response)}"),
        ]
    elif eval_name in ("trigger-single-edit-skips", "trigger-code-task-skips", "verbatim-exact-prose", "verbatim-awkward-phrasing", "subunits-2-level-nesting", "removal-renumbers-siblings", "removal-subtree-on-parent", "mixed-shapes-document"):
        expectations = grader(run_dir, is_baseline=is_baseline)
    else:
        expectations = grader(run_dir)
    # Universal slot-fill check: any produced widget.html must have CSS and JS substituted (not literal slot tokens).
    widget_path = run_dir / "outputs" / "widget.html"
    if not is_baseline and widget_path.exists():
        widget = widget_path.read_text()
        if widget.strip():
            has_css_token = "{{WIDGET_CSS}}" in widget
            has_js_token = "{{WIDGET_JS}}" in widget
            unfilled = [token for token, present in (("{{WIDGET_CSS}}", has_css_token), ("{{WIDGET_JS}}", has_js_token)) if present]
            expectations.append(
                assertion(
                    "no_unfilled_slot_tokens: WIDGET_CSS and WIDGET_JS substituted into widget",
                    len(unfilled) == 0,
                    f"unfilled tokens present: {unfilled}" if unfilled else "",
                )
            )
    return expectations


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("iteration_dir", type=Path, help="Path to the iteration directory containing eval-* subdirectories")
    args = parser.parse_args()
    iteration_dir = args.iteration_dir.resolve()
    if not iteration_dir.exists():
        raise SystemExit(f"Iteration directory not found: {iteration_dir}")
    summary = []
    for eval_dir in sorted(iteration_dir.glob("eval-*")):
        eval_name = eval_dir.name[len("eval-"):]
        for variant in ("with_skill", "without_skill"):
            variant_dir = eval_dir / variant
            if not variant_dir.exists():
                continue
            run_dir = variant_dir / "run-1" if (variant_dir / "run-1").exists() else variant_dir
            is_baseline = variant == "without_skill"
            try:
                expectations = grade_run(eval_name, run_dir, is_baseline)
            except Exception as error:
                expectations = [assertion("grading_error", False, str(error))]
            passed_count = sum(1 for expectation in expectations if expectation["passed"])
            total = len(expectations)
            pass_rate = passed_count / total if total else 0.0
            grading_path = run_dir / "grading.json"
            grading_path.write_text(json.dumps({
                "expectations": expectations,
                "summary": {"passed": passed_count, "failed": total - passed_count, "total": total, "pass_rate": pass_rate}
            }, indent=2))
            summary.append(f"{eval_name} ({variant}): {passed_count}/{total} ({pass_rate:.0%})")
    print("\n".join(summary))


if __name__ == "__main__":
    main()
