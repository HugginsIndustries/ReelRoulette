"""Cuts the WebUI's Material Symbols font down to the icons the mockups use, at the WebUI's axis settings.

Writes icons.json next to this script. Needs fontTools; run it only when the icon list changes.
"""
import base64
import io
import json
import os

from fontTools import subset
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

here = os.path.dirname(os.path.abspath(__file__))
src = os.path.join(here, "..", "..", "..", "..", "src", "clients", "web", "ReelRoulette.WebUI", "public", "assets",
                   "fonts", "MaterialSymbolsOutlined.var.ttf")
out_json = os.path.join(here, "icons.json")
ICONS = ["browse", "filter_alt", "tag", "favorite", "thumb_down", "skip_previous", "play_arrow", "pause",
         "skip_next", "volume_up", "volume_off", "repeat_one", "autoplay", "fullscreen", "fullscreen_exit", "close",
         "refresh", "error", "bar_chart", "settings", "admin_panel_settings", "edit_note", "add", "remove", "save",
         "auto_awesome", "drag_indicator", "dock_to_right", "photo", "right_panel_open", "right_panel_close",
         "left_panel_open", "left_panel_close", "checklist", "check_circle", "expand_more", "content_copy", "folder_open",
         "heart_plus", "heart_minus", "delete", "history", "keyboard", "info", "warning", "arrow_back", "download",
         "upload", "power_settings_new", "update", "dns", "storage", "bug_report", "group", "article", "sync",
         "folder", "content_paste", "visibility", "visibility_off", "desktop_windows", "open_in_new", "key",
         "volume_down", "lan", "shuffle", "radio_button_unchecked", "description", "swap_vert", "restart_alt", "unfold_less", "unfold_more", "tune", "chevron_right", "expand_less"]

font = TTFont(src)
cmap = font.getBestCmap()
by_glyph = {}
for cp, glyph in sorted(cmap.items()):
    if cp >= 0xE000:
        by_glyph.setdefault(glyph, cp)
codepoints = {name: by_glyph[name] for name in ICONS}

static = instancer.instantiateVariableFont(font, {"FILL": 0, "GRAD": 0, "opsz": 48, "wght": 700})
options = subset.Options()
options.layout_features = []
options.name_IDs = ["*"]
options.flavor = "woff2"
sub = subset.Subsetter(options)
sub.populate(unicodes=list(codepoints.values()))
sub.subset(static)
static.flavor = "woff2"
buffer = io.BytesIO()
static.save(buffer)
data = buffer.getvalue()
with open(out_json, "w") as out:
    json.dump({"woff2": base64.b64encode(data).decode(), "codepoints": codepoints}, out)
print(f"{out_json}: {len(codepoints)} icons, {len(data)} bytes of woff2")
