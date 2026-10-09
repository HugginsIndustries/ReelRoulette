"""Cuts the WebUI's Material Symbols font down to the icons the mockups use, at the WebUI's axis settings.

The few icons the tiles show filled are also cut at FILL 1, as a second font; the WebUI sets the variable font's FILL
axis instead.

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
         "volume_down", "lan", "shuffle", "radio_button_unchecked", "description", "swap_vert", "restart_alt", "unfold_less", "unfold_more", "tune", "chevron_right", "expand_less", "play_circle"]
# Shown filled on library tiles: the favorite and blacklist badges, the playing icon, and the selection icon.
FILLED = ["favorite", "thumb_down", "play_circle", "check_circle"]

font = TTFont(src)
cmap = font.getBestCmap()
by_glyph = {}
for cp, glyph in sorted(cmap.items()):
    if cp >= 0xE000:
        by_glyph.setdefault(glyph, cp)
codepoints = {name: by_glyph[name] for name in ICONS}



def cut(fill, names):
    static = instancer.instantiateVariableFont(TTFont(src), {"FILL": fill, "GRAD": 0, "opsz": 48, "wght": 700})
    options = subset.Options()
    options.layout_features = []
    options.name_IDs = ["*"]
    options.flavor = "woff2"
    sub = subset.Subsetter(options)
    sub.populate(unicodes=[codepoints[name] for name in names])
    sub.subset(static)
    static.flavor = "woff2"
    buffer = io.BytesIO()
    static.save(buffer)
    return buffer.getvalue()


outlined = cut(0, ICONS)
filled = cut(1, FILLED)
with open(out_json, "w") as out:
    json.dump({"woff2": base64.b64encode(outlined).decode(), "woff2Filled": base64.b64encode(filled).decode(),
               "codepoints": codepoints}, out)
print(f"{out_json}: {len(codepoints)} icons, {len(outlined)} bytes of woff2, {len(FILLED)} filled in {len(filled)} bytes")
