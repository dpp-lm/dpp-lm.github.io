# dpp-lm.github.io

Project page for "A Model of Diverse Sampling from Language Models" (NeurIPS 2026), served at https://dpp-lm.github.io/. The interactive demo on a live model is a separate repository served under `/demo/`.

## Run locally

The site is static with no build step. From the repository root:

    python3 -m http.server 8000

Then open http://localhost:8000/. Opening `index.html` as a file does not work because widgets load as ES modules.

## Layout

- `index.html`: the page, with one mount point per widget (`<div class="widget" data-widget="NAME">`).
- `css/tokens.css`: shared design tokens (colors, type, widths) for light and dark.
- `css/site.css`: page typography and layout. `css/w-NAME.css`: one stylesheet per widget.
- `js/site.js`: mounts widgets lazily, renders math with KaTeX (loaded from jsDelivr), the BibTeX copy button, nav highlighting, and the theme toggle.
- `js/w-NAME.js`: exports `mount(el)` for the widgets `samples`, `volume`, `pool`, and `frontier`. Pure logic is in `js/w-NAME-lib.js`, with tests in `tests/` (`node --test tests/`).
- `js/vendor/dpp.js`: the DPP math shared with the demo.
- `dev/NAME.html`: a page that mounts a single widget.
- `data/`: data used by the widgets.
- `assets/`: favicon, Open Graph image, demo screenshot.

## Data sources

- Paper numbers come from the committed outputs in `analysis/*.json` of https://github.com/rycolab/pool-dpp.
- The `samples` widget uses pools of 200 real draws from Qwen3 14B per prompt, from the demo repository.
