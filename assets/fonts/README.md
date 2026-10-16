# Material Symbols (Outlined) — Font Asset

This folder contains the **Material Symbols Outlined** variable font used for consistent, cross-platform UI icons in ReelRoulette.

## File

- `MaterialSymbolsOutlined.var.ttf` — Material Symbols Outlined (variable font)

## Usage

- **Web UI:** used as an icon font. Icons are referenced by ligature name (e.g., `play_arrow`), tinted via CSS `color`, and can be styled via weight/size.

## Notes

- This is a **variable font**. ReelRoulette primarily relies on:
  - consistent icon shapes
  - runtime tinting
  - size scaling
  - weight adjustments (where supported)

We intentionally avoid embedding user/library-specific values in icon rendering or logs.

## Source

- Material Symbols documentation: [Google Fonts Material Symbols docs](https://developers.google.com/fonts/docs/material_symbols)

## License

Material Symbols are provided under the **Apache License 2.0**.  
See: [Apache License 2.0](https://www.apache.org/licenses/LICENSE-2.0)

## Update process

When updating the font:

1. Download the updated **Material Symbols Outlined** variable font.
2. Replace `MaterialSymbolsOutlined.var.ttf`.
3. Verify icons render correctly in the Web UI (browser).
4. Commit with a note about the update date/version/source.
