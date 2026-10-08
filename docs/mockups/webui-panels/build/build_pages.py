"""Inlines the shared styles, script, and icon font into each mockup page, writing them one folder up."""
import json
import os

here = os.path.dirname(os.path.abspath(__file__))
out_dir = os.path.dirname(here)
icons = json.load(open(os.path.join(here, "icons.json")))
css = open(os.path.join(here, "common.css")).read().replace("@FONT_B64@", icons["woff2"])
js = open(os.path.join(here, "common.js")).read().replace(
    "/*@ICON_CODEPOINTS@*/ {}", json.dumps(icons["codepoints"], sort_keys=True)
)

for name in ("index", "layout", "validation"):
    page = open(os.path.join(here, f"{name}.src.html")).read()
    assert page.count("/*@COMMON_CSS@*/") == 1 and page.count("/*@COMMON_JS@*/") == 1, name
    page = page.replace("/*@COMMON_CSS@*/", css).replace("/*@COMMON_JS@*/", js)
    assert "@FONT_B64@" not in page and "@ICON_CODEPOINTS@" not in page, name
    path = os.path.join(out_dir, f"{name}.html")
    open(path, "w").write(page)
    print(f"{path}: {len(page.encode()) // 1024} KB")
