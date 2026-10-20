# CHANGELOG

## 2026-10-20 (word actions moved into a bubble)

- Changed: clicking a highlighted word opens a bubble anchored to the word with Search and Mark as known buttons. Double-click no longer runs an action of its own.
- Changed: the bubble follows the word on scroll, including scrolling inside nested containers, and closes on outside click, on Escape, or when the word leaves the viewport. Its styles live in a shadow root so page CSS cannot restyle it.
- Removed: the Click and Double-click action settings in the popup, along with the 220 ms click delay they required. The popup section that held them is now titled Settings.

## 2026-10-20 (skip content declared as a non-Japanese language)

- Added: text nodes are filtered by their nearest `lang` declaration. Content explicitly declared as another language (zh, en, and so on) is no longer tokenized or highlighted. Undeclared and empty declarations are still processed, because Aozora pages carry no `lang` attribute.

## 2026-10-20 (highlights rendered with the CSS Custom Highlight API)

- Changed: page highlights moved from absolutely positioned overlay buttons to the CSS Custom Highlight API, so clipping and scrolling are left to the browser. Pages no longer get a horizontal scrollbar, and highlights inside horizontally scrolling containers no longer drift.
- Changed: highlight style is a light tint plus a thin underline, with adjacent words alternating between two tint depths so word boundaries stay visible. Border and border radius are not supported by the API.
- Changed: click and double-click now hit highlighted words by character offset at the pointer, and the page DOM is no longer modified. Hit testing uses `caretPositionFromPoint`, so the extension requires Chrome 128 or newer.
- Changed: a known-word change rebuilds the highlights from a fresh pass over the page instead of redrawing the overlay.
- Removed: overlay element, batched animation-frame rendering, resize redraw, and `getSearchEngineLabel`, which only served the overlay tooltips.
