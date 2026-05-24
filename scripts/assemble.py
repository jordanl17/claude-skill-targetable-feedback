#!/usr/bin/env python3
"""Assemble the bundled widget from split source assets.

Reads:
    widget-src/widget.html  (template with {{WIDGET_CSS}} and {{WIDGET_JS}} slots)
    widget-src/widget.css   (styles)
    widget-src/widget.js    (behaviour)

Writes:
    targetable-feedback/assets/widget-bundled.html  (single file, CSS + JS inlined and lightly minified)

The split sources live outside the skill folder - only the bundled file
ships in the zip. Splitting keeps editing tractable; bundling at build time
keeps runtime token cost low.

Run:
    python3 scripts/assemble.py
"""

import re
from pathlib import Path


def minify_css(css):
    """Conservative CSS minification: strip comments and collapse whitespace.

    Keeps content inside url() and quoted strings untouched.
    """
    placeholders = []

    def stash(match):
        placeholders.append(match.group(0))
        return f"\x00{len(placeholders) - 1}\x00"

    css = re.sub(r'url\([^)]*\)|"[^"]*"|\'[^\']*\'', stash, css)
    css = re.sub(r'/\*.*?\*/', '', css, flags=re.DOTALL)
    css = re.sub(r'\s+', ' ', css)
    css = re.sub(r'\s*([{}:;,])\s*', r'\1', css)
    css = re.sub(r';}', '}', css)
    css = css.strip()
    css = re.sub(r'\x00(\d+)\x00', lambda match: placeholders[int(match.group(1))], css)
    return css


def minify_js(js):
    """Very conservative JS minification: strip block comments, line comments, and blank lines.

    Avoids touching string contents. Keeps in-statement whitespace untouched
    to avoid ASI hazards. Strips whole-line comments BEFORE stashing strings,
    because a comment containing an unbalanced apostrophe (e.g. "don't")
    would otherwise be matched by the single-quoted-string regex and gobble
    up code across lines.
    """
    js = re.sub(r'^[ \t]*//[^\n]*$', '', js, flags=re.MULTILINE)

    placeholders = []

    def stash(match):
        placeholders.append(match.group(0))
        return f"\x00{len(placeholders) - 1}\x00"

    js = re.sub(r'"(?:\\.|[^"\\])*"|\'(?:\\.|[^\'\\])*\'|`(?:\\.|[^`\\])*`', stash, js)
    js = re.sub(r'/\*.*?\*/', '', js, flags=re.DOTALL)
    js = re.sub(r'\n\s*\n', '\n', js)
    js = '\n'.join(line.lstrip() for line in js.split('\n') if line.strip())
    js = re.sub(r'\x00(\d+)\x00', lambda match: placeholders[int(match.group(1))], js)
    return js


def minify_html_structure(html):
    """Collapse leading whitespace and blank lines in HTML markup.

    Preserves the literal contents of any template slot tokens (left as-is for
    later substitution by Claude). Does NOT compact text content between tags
    to avoid changing rendered output.
    """
    lines = [line.strip() for line in html.split('\n') if line.strip()]
    return '\n'.join(lines)


def main():
    repo_root = Path(__file__).resolve().parent.parent
    src = repo_root / "widget-src"
    output_dir = repo_root / "targetable-feedback" / "assets"
    template = (src / "widget.html").read_text()
    css = (src / "widget.css").read_text()
    js = (src / "widget.js").read_text()

    minified_css = minify_css(css)
    minified_js = minify_js(js)
    minified_template = minify_html_structure(template)

    bundled = minified_template.replace("{{WIDGET_CSS}}", minified_css).replace("{{WIDGET_JS}}", minified_js)
    output_path = output_dir / "widget-bundled.html"
    output_path.write_text(bundled)

    original_size = len(template) + len(css) + len(js)
    bundled_size = len(bundled)
    saved = original_size - bundled_size
    pct = (saved / original_size) * 100 if original_size else 0
    print(f"Bundled: {output_path}")
    print(f"  source: {original_size:,} bytes (widget.html {len(template):,} + widget.css {len(css):,} + widget.js {len(js):,})")
    print(f"  bundle: {bundled_size:,} bytes ({pct:.1f}% smaller)")


if __name__ == "__main__":
    main()
