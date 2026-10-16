#!/usr/bin/env python3
"""Render a project markdown document to a print-ready PDF.

Usage:
    python3 docs/render_prd_pdf.py [PRD.md TECH_SPEC.md ...]

Defaults to rendering every top-level document in docs/.
"""

import re
import sys
from pathlib import Path

import markdown
from xhtml2pdf import pisa

ROOT = Path(__file__).resolve().parent
DEFAULT_DOCS = ["PRD.md", "TECH_SPEC.md"]

CSS = """
@page {
    size: A4;

    @frame content {
        left: 45pt;
        width: 505pt;
        top: 48pt;
        height: 730pt;
    }

    @frame footer {
        -pdf-frame-content: footerContent;
        left: 45pt;
        width: 505pt;
        top: 800pt;
        height: 22pt;
    }
}

html, body {
    font-family: Helvetica, Arial, sans-serif;
    font-size: 9.5pt;
    color: #111111;
    line-height: 1.45;
}

h1 {
    font-size: 20pt;
    font-weight: bold;
    color: #111111;
    margin: 0 0 8pt 0;
    padding-bottom: 8pt;
    border-bottom: 2pt solid #111111;
}

h2 {
    font-size: 13pt;
    font-weight: bold;
    color: #111111;
    margin: 18pt 0 7pt 0;
    padding-top: 8pt;
    border-top: 0.6pt solid #cccccc;
}

h3 {
    font-size: 11pt;
    font-weight: bold;
    color: #222222;
    margin: 14pt 0 5pt 0;
}

h4 {
    font-size: 10pt;
    font-weight: bold;
    color: #333333;
    margin: 12pt 0 5pt 0;
}

p {
    margin: 0 0 7pt 0;
}

ul, ol {
    margin: 0 0 8pt 16pt;
}

li {
    margin-bottom: 2pt;
}

strong {
    font-weight: bold;
}

em {
    font-style: italic;
}

hr {
    border: none;
    border-top: 0.6pt solid #cccccc;
    margin: 10pt 0;
}

code {
    font-family: Courier, monospace;
    font-size: 8.5pt;
    background-color: #f3f3f3;
}

table {
    width: 100%;
    border-collapse: collapse;
    margin: 6pt 0 12pt 0;
    font-size: 8.5pt;
}

th {
    text-align: left;
    background-color: #111111;
    color: #ffffff;
    font-weight: bold;
    padding: 5pt 6pt;
    border: 0.5pt solid #111111;
}

td {
    padding: 4.5pt 6pt;
    border: 0.5pt solid #cfcfcf;
    vertical-align: top;
}

.meta {
    color: #555555;
    font-size: 9pt;
    margin-bottom: 12pt;
}

pre {
    font-family: Courier, monospace;
    font-size: 6.8pt;
    line-height: 1.25;
    background-color: #f7f7f7;
    border: 0.5pt solid #e2e2e2;
    padding: 5pt 6pt;
    margin: 6pt 0 10pt 0;
}

pre code {
    background-color: transparent;
    font-size: 6.8pt;
}

#footerContent {
    font-size: 8pt;
    color: #666666;
    border-top: 0.5pt solid #dddddd;
    padding-top: 3pt;
}
"""


def extract_meta(source: str, fallback_title: str) -> tuple[str, str]:
    """Pull the document title and a footer strapline out of the markdown."""
    title_match = re.search(r"^#\s+(.+)$", source, re.MULTILINE)
    title = title_match.group(1).strip() if title_match else fallback_title

    parts = []
    for label in ("Version", "Date"):
        match = re.search(rf"^\*\*{label}:\*\*\s*(.+?)\s*$", source, re.MULTILINE)
        if match:
            parts.append(match.group(1))

    strapline = " &nbsp;·&nbsp; ".join([title, *parts])
    return title, strapline


def render(md_path: Path) -> Path:
    source = md_path.read_text(encoding="utf-8")
    title, strapline = extract_meta(source, md_path.stem)

    body = markdown.markdown(
        source,
        extensions=["tables", "sane_lists", "smarty", "fenced_code"],
        output_format="html",
    )

    html = f"""<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>{title}</title>
  <style>{CSS}</style>
</head>
<body>
  {body}
  <div id="footerContent">
    {strapline}
    &nbsp;&nbsp;&nbsp;
    Page <pdf:pagenumber> of <pdf:pagecount>
  </div>
</body>
</html>
"""

    pdf_path = md_path.with_suffix(".pdf")
    with pdf_path.open("wb") as pdf_file:
        result = pisa.CreatePDF(html, dest=pdf_file, encoding="utf-8")

    if result.err:
        raise SystemExit(f"{md_path.name}: PDF generation failed with {result.err} error(s)")

    return pdf_path


def main() -> None:
    names = sys.argv[1:] or DEFAULT_DOCS
    for name in names:
        md_path = Path(name)
        if not md_path.is_absolute():
            md_path = ROOT / md_path
        if not md_path.exists():
            raise SystemExit(f"Not found: {md_path}")
        pdf_path = render(md_path)
        print(f"Wrote {pdf_path} ({pdf_path.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
