# CHANGELOG

## 2026-10-20 (highlights rendered with the CSS Custom Highlight API)

- Changed: page highlights moved from absolutely positioned overlay buttons to the CSS Custom Highlight API, so clipping and scrolling are left to the browser. Pages no longer get a horizontal scrollbar, and highlights inside horizontally scrolling containers no longer drift.
- Changed: highlight style is a light tint plus a thin underline, with adjacent words alternating between two tint depths so word boundaries stay visible. Border and border radius are not supported by the API.
- Changed: click and double-click now hit highlighted words by character offset at the pointer, and the page DOM is no longer modified.
- Changed: a known-word change only rebuilds the highlight ranges instead of redrawing the whole page.
- Removed: overlay element, batched animation-frame rendering, resize redraw, and `getSearchEngineLabel`, which only served the overlay tooltips.
