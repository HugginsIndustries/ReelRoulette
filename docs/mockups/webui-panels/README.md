# WebUI panel mockups

Interactive mockups of the WebUI's responsive layout, approved before the code was written. They are kept as the design reference after that work ships, and are not part of the WebUI build.

- `index.html` links the pages and lists the numbers set with them.
- `layout.html` shows the main page:
  - the side panel on either side of the player, with its resize handle;
  - the icon tab row;
  - the full-screen overlay at phone widths;
  - what Auto-Pause does, shown by a stand-in video that plays;
  - the in-app dialogs;
  - drag-handle reordering;
  - the scrub bar on photos.
- `validation.html` shows each state of the field validation pattern, with what a screen reader is given.

Magenta dashed boxes and the **Mockup** tab on the left edge are mockup controls, not part of the design.

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
