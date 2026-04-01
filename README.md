# Tango Highlighter

A small Chrome extension for Japanese reading practice.

It highlights Japanese words on `aozora.gr.jp` that are not in your known word list.
You can add known words from the popup, or click a highlighted word on the page to mark it as known.

## What it does

- stores your known words in `chrome.storage.local`
- segments Japanese text with `Intl.Segmenter`
- highlights words that are not in your known list
- lets you manage the known word list from the extension popup

## Files

- `manifest.json`: Chrome extension manifest
- `popup.html`: popup UI
- `popup.js`: popup logic for adding/removing known words
- `content.js`: content script that highlights unknown words on the page
- `content.css`: styles for highlighted words
- `icon/`: extension icons

## Supported site

Currently only:

- `https://www.aozora.gr.jp/*`

## How to load

1. Open Chrome.
2. Go to `chrome://extensions`.
3. Enable Developer mode.
4. Click `Load unpacked`.
5. Select this project folder.

## How to use

1. Open a supported page on Aozora Bunko.
2. Click the extension icon.
3. Add words you already know.
4. Unknown Japanese words on the page will be underlined.
5. Click a highlighted word on the page to add it to your known words.

## Notes

- This project uses plain HTML, CSS, and JavaScript.
- There is no build step.
- Known words are stored locally in the browser.

## Version

Current manifest version: `1.0`
