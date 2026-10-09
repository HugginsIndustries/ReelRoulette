"""Inlines the shared styles, script, icon font, and logo into each mockup page, writing them one folder up."""
import base64
import json
import os

here = os.path.dirname(os.path.abspath(__file__))
out_dir = os.path.dirname(here)
icons = json.load(open(os.path.join(here, "icons.json")))
css = (open(os.path.join(here, "common.css")).read()
       .replace("@FONT_B64@", icons["woff2"]).replace("@FONT_FILLED_B64@", icons["woff2Filled"]))
js = open(os.path.join(here, "common.js")).read().replace(
    "/*@ICON_CODEPOINTS@*/ {}", json.dumps(icons["codepoints"], sort_keys=True)
)

# The logo files in assets/logo/, as they are, for the header, the page icon, the recovery page, and the desktop notice.
logo_dir = os.path.join(here, "..", "..", "..", "..", "assets", "logo")
logos = {
    placeholder: "data:image/svg+xml;base64," + base64.b64encode(open(os.path.join(logo_dir, file), "rb").read()).decode()
    for placeholder, file in (("@LOGO_ICON@", "logo-icon.svg"), ("@LOGO_LOCKUP@", "logo-lockup.svg"), ("@LOGO_LOCKUP_DARK@", "logo-lockup-dark.svg"))
}
page_icon = f'<link rel="icon" type="image/svg+xml" href="{logos["@LOGO_ICON@"]}">'

for name in ("index", "layout", "validation", "admin", "recovery", "desktop-notice"):
    page = open(os.path.join(here, f"{name}.src.html")).read()
    assert page.count("/*@COMMON_CSS@*/") == 1 and page.count("/*@COMMON_JS@*/") == 1, name
    page = page.replace("/*@COMMON_CSS@*/", css).replace("/*@COMMON_JS@*/", js)
    assert page.count("</title>") == 1, name
    page = page.replace("</title>", "</title>\n" + page_icon)
    for placeholder, uri in logos.items():
        page = page.replace(placeholder, uri)
    assert "@FONT_B64@" not in page and "@FONT_FILLED_B64@" not in page and "@ICON_CODEPOINTS@" not in page and "@LOGO_" not in page, name
    path = os.path.join(out_dir, f"{name}.html")
    open(path, "w").write(page)
    print(f"{path}: {len(page.encode()) // 1024} KB")
