"""Builds docs/HCIM-Requirements.pdf from docs/HCIM-Requirements.md.

    pip install markdown
    python3 docs/build_requirements.py [path/to/node_modules]    # needs Google Chrome

Fonts (Newsreader, Figtree) are read from @fontsource-variable in the given node_modules
(default: frontend/node_modules).
"""

import base64
import html
import re
import subprocess
import sys
from pathlib import Path

import markdown

HERE = Path(__file__).resolve().parent
FONTS = Path(sys.argv[1]) if len(sys.argv) > 1 else HERE.parent / "frontend" / "node_modules"
SRC = HERE / "HCIM-Requirements.md"
HTML = HERE / "HCIM-Requirements.html"
PDF = HERE / "HCIM-Requirements.pdf"


def font(path):
	return base64.b64encode((FONTS / path).read_bytes()).decode()


def logo():
	return base64.b64encode((HERE / "logo.png").read_bytes()).decode()


text = SRC.read_text()
meta_version = re.search(r"\*\*Version\*\* \| (.+?) \|", text).group(1)
# drop the two title headings (the cover carries the title)
body_md = re.sub(r"^# .*\n\n## .*\n\n", "", text, count=1)
body_md = body_md.replace("| | |\n|---|---|", "| | |\n|---|---|", 1)
md = markdown.Markdown(
	extensions=["tables", "fenced_code", "toc", "sane_lists"], extension_configs={"toc": {"toc_depth": "2-2"}}
)
body = md.convert(body_md)
body = re.sub(r"<thead>\s*<tr>\s*<th></th>\s*<th></th>\s*</tr>\s*</thead>", "", body)


# table of contents from the h2 headings
toc = re.findall(r'<h2 id="([^"]+)">(.+?)</h2>', body)
toc_html = "".join(f'<li><a href="#{i}">{t}</a></li>' for i, t in toc)

# the first block (the meta table) is shown on the cover, so it is dropped here
first = body.index("<hr")
body = '<section class="main">' + re.sub(r"^<hr\s*/?>", "", body[first:]) + "</section>"

# visual details
body = re.sub(
	r"<strong>TBC([^<]*)</strong>", lambda m: f'<span class="tbc">TBC{html.escape(m.group(1))}</span>', body
)
body = re.sub(
	r"<td>(Must|Should|Could)</td>",
	lambda m: f'<td><span class="pri pri-{m.group(1)}">{m.group(1)}</span></td>',
	body,
)
body = re.sub(
	r"<td>(Confirmed|Proposed)</td>",
	lambda m: f'<td><span class="src src-{m.group(1)}">{m.group(1)}</span></td>',
	body,
)

CSS = f"""
@font-face {{ font-family: 'Newsreader'; src: url(data:font/woff2;base64,{font("@fontsource-variable/newsreader/files/newsreader-latin-opsz-normal.woff2")}); font-weight: 200 800; }}
@font-face {{ font-family: 'Newsreader'; font-style: italic; src: url(data:font/woff2;base64,{font("@fontsource-variable/newsreader/files/newsreader-latin-opsz-italic.woff2")}); font-weight: 200 800; }}
@font-face {{ font-family: 'Figtree'; src: url(data:font/woff2;base64,{font("@fontsource-variable/figtree/files/figtree-latin-wght-normal.woff2")}); font-weight: 300 900; }}
:root {{ --ink:#1d2421; --soft:#4a544f; --mute:#7d867f; --line:#e1e4de; --paper:#f6f5f0; --green:#2f6b57; --green-soft:#dcebe3; --amber:#9a5b13; --amber-soft:#fbeedc; --red:#a3332a; }}
@page {{ size: A4; margin: 18mm 16mm 18mm; @bottom-left {{ content: "HCIM · Customer requirements"; font: 8pt Figtree; color: #8a908c; }} @bottom-right {{ content: counter(page); font: 8pt Figtree; color: #8a908c; }} }}
@page :first {{ margin: 0; @bottom-left {{ content: none; }} @bottom-right {{ content: none; }} }}
* {{ box-sizing: border-box; }}
html {{ -webkit-print-color-adjust: exact; print-color-adjust: exact; }}
body {{ font: 10pt/1.55 Figtree, sans-serif; color: var(--ink); margin: 0; }}
.cover {{ height: 297mm; padding: 26mm 22mm; background: #123a2c; color: #f1efe6; display: flex; flex-direction: column; page-break-after: always; position: relative; overflow: hidden; }}
.cover::after {{ content: ""; position: absolute; right: -60mm; bottom: -50mm; width: 170mm; height: 170mm; border-radius: 50%; background: radial-gradient(circle at 30% 30%, #2f6b57, #123a2c 70%); opacity: .55; }}

.cover .logo {{ align-self: flex-start; background: #f6f5f0; border-radius: 4mm; padding: 4mm 6mm; }}
.cover img {{ display: block; width: 52mm;  }}
.cover .eyebrow {{ margin-top: 52mm; font-size: 9pt; letter-spacing: .18em; text-transform: uppercase; color: #9dc7b4; }}
.cover h1 {{ font: 500 40pt/1.05 Newsreader, serif; margin: 6mm 0 6mm; max-width: 150mm; }}
.cover h1 i {{ color: #9dc7b4; }}
.cover .sub {{ font-size: 13pt; color: #cfe0d6; max-width: 130mm; }}
.cover dl {{ position: absolute; left: 22mm; bottom: 26mm; margin: 0; display: grid; grid-template-columns: 34mm 1fr; gap: 3mm 4mm; font-size: 9.5pt; z-index: 2; }}
.cover dt {{ color: #9dc7b4; }} .cover dd {{ margin: 0; }}
.toc {{ padding-top: 2mm; margin-bottom: 4mm; }}
.toc h2 {{ font: 500 24pt Newsreader, serif; margin: 0 0 6mm; }}
.toc ol {{ list-style: none; padding: 0; margin: 0; columns: 2; column-gap: 10mm; }}
.toc li {{ border-bottom: 1px solid var(--line); padding: 1.8mm 0; font-size: 9.8pt; break-inside: avoid; }}
.toc a {{ color: var(--ink); text-decoration: none; }}
h2 {{ font: 500 18pt/1.15 Newsreader, serif; color: var(--green); margin: 8mm 0 3mm; padding-bottom: 2mm; border-bottom: 2px solid var(--green-soft); break-after: avoid; }}
h2.plain {{ margin-top: 0; }}
h2.pb {{ break-before: page; margin-top: 0; }}
h3 {{ font: 700 11.2pt Figtree; color: var(--ink); margin: 6.5mm 0 2mm; break-after: avoid; }}
p {{ margin: 0 0 2.6mm; orphans: 3; widows: 3; }}
ul, ol {{ margin: 0 0 3mm; padding-left: 5.5mm; }} li {{ margin: .8mm 0; }}
a {{ color: var(--green); }}
strong {{ font-weight: 700; }}
table {{ width: 100%; border-collapse: collapse; margin: 2mm 0 4mm; font-size: 9pt; break-inside: auto; }}
thead {{ display: table-header-group; }}
th {{ text-align: left; background: var(--paper); color: var(--soft); font-weight: 700; font-size: 7.8pt; letter-spacing: .04em; text-transform: uppercase; padding: 2mm 2.4mm; border-bottom: 1.5px solid #cfd4cc; }}
td {{ padding: 1.9mm 2.4mm; border-bottom: 1px solid var(--line); vertical-align: top; }}
tr {{ break-inside: avoid; }}
td.id {{ font: 600 7.8pt/1.4 ui-monospace, monospace; color: var(--green); white-space: nowrap; }}
.pri, .src, .st, .tbc {{ display: inline-block; font-size: 7.4pt; font-weight: 700; border-radius: 99px; padding: .2mm 2mm; white-space: nowrap; }}
.pri-Must {{ background: #fbe3df; color: var(--red); }} .pri-Should {{ background: var(--amber-soft); color: var(--amber); }} .pri-Could {{ background: #e8eceb; color: var(--soft); }}
.src-Confirmed {{ background: var(--green-soft); color: var(--green); }} .src-Proposed {{ background: #e8eceb; color: var(--soft); }}
.st-ok {{ background: var(--green-soft); color: var(--green); }} .st-part {{ background: var(--amber-soft); color: var(--amber); }}
.tbc {{ background: var(--amber-soft); color: var(--amber); letter-spacing: .03em; }}
pre {{ background: #123a2c; color: #dcebe3; padding: 4mm; border-radius: 2.5mm; font: 8.3pt/1.6 ui-monospace, monospace; overflow: hidden; white-space: pre; font-size: 7.8pt; }}
code {{ font: 8.4pt ui-monospace, monospace; background: var(--paper); padding: .2mm 1.2mm; border-radius: 1mm; }}
pre code {{ background: none; padding: 0; }}
em {{ color: var(--mute); }}
"""

cover = f"""
<div class="cover">
  <span class="logo"><img src="data:image/png;base64,{logo()}" alt=""></span>
  <div class="eyebrow">Customer requirements and scope</div>
  <h1>Health-Center <i>Inventory</i> Management</h1>
  <div class="sub">Medicine stock, requisitions, expired returns and patient registration for health centers, on Sky ERP.</div>
  <dl>
    <dt>First customer</dt><dd>Mr. Emmanuel (pilot)</dd>
    <dt>Prepared by</dt><dd>SkyEngPro</dd>
    <dt>Version</dt><dd>{html.escape(meta_version)}</dd>
  </dl>
</div>
<div class="toc"><h2>Contents</h2><ol>{toc_html}</ol></div>
"""

HTML.write_text(
	f'<!doctype html><html lang="en"><head><meta charset="utf-8"><title>HCIM Customer Requirements</title><style>{CSS}</style></head><body>{cover}{body}</body></html>'
)
subprocess.run(
	[
		"google-chrome",
		"--headless=new",
		"--no-sandbox",
		"--disable-gpu",
		"--no-pdf-header-footer",
		f"--print-to-pdf={PDF}",
		f"file://{HTML}",
	],
	check=True,
	capture_output=True,
)
HTML.unlink()
print("written", PDF)
