# WebUI design mockup

An interactive mockup of the whole visible UI of v0.15.0, approved before the milestones that build it. It stays as the design reference after that work ships, and is not part of the WebUI build.

- `index.html` links the pages and lists the numbers set with them.
- `layout.html` shows the main page:
  - the header, the player with its controls, and the status line;
  - the side panel on either side of the player, with its resize handle, or as the full-screen overlay at phone widths;
  - the Library, Filter, Tags, Stats, and Settings tabs, with multi-select and bulk actions in the Library;
  - the in-app dialogs, the keyboard shortcuts, and the volume control;
  - what Auto-Pause does, shown by a stand-in video that plays.
- `admin.html` shows the full-page admin view, its sections, duplicate review, and the control token gate.
- `validation.html` shows each state of the field validation pattern, with what a screen reader is given.
- `desktop-notice.html` shows the notice the last desktop build gives once.

Magenta dashed boxes and the mockup controls are not part of the design. A note that starts with "Proposed" or "Open" marks something still to decide.

## Opening them

On a desktop, open `index.html` in a browser.

A phone may not run a page opened as a local file, so serve the folder and open it over the LAN. From the repository root:

```sh
python3 -m http.server 8000 --bind 0.0.0.0 --directory docs/mockups/webui-panels
```

Then open `http://<this computer's LAN address>:8000/` on the phone, and stop the server with Ctrl+C when done.

## Changing them

Each page is self-contained: styles, script, and icons are inlined, so it opens without the WebUI or a network. The pages are built from the sources in `build/`:

- `common.css` and `common.js` are shared by every page. They hold the WebUI's theme tokens, the field validation pattern, and the dialog component.
- `*.src.html` are the pages, with placeholders for the shared parts.
- `icons.json` holds the icon font, cut down to the icons the pages use, and their codepoints.

After editing a source, rebuild the pages:

```sh
python3 docs/mockups/webui-panels/build/build_pages.py
```

To use an icon that isn't in `icons.json`, add its name to `ICONS` in `build/build_font.py`, run that script, then rebuild. The script cuts the WebUI's Material Symbols font and needs [fontTools](https://github.com/fonttools/fonttools).

`build/check.mjs` loads each page in happy-dom and drives the main interactions to catch script errors. It does no layout, so it can't check how the pages look or pointer dragging. It uses the WebUI's dev dependencies, so run `npm install` in `src/clients/web/ReelRoulette.WebUI` first:

```sh
node docs/mockups/webui-panels/build/check.mjs
```
