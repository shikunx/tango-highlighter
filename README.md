# Tango Highlighter

A Chrome extension for Japanese reading practice.

It highlights Japanese words you have not saved yet and lets you manage your known words from the popup.
You can also click a highlighted word on the page to save it.

## What it does

- saves your known words and settings in the browser
- highlights words you have not saved yet
- lets you manage the known word list from the popup
- lets you turn highlighting on or off for each site

## Files

- `manifest.json`: extension settings
- `popup.html`: popup
- `storage.js`: shared helper
- `popup.js`: popup logic
- `content.js`: page highlighting logic
- `content.css`: highlight styles
- `icon/`: icons

## Supported site

The extension can run on any page, but highlighting only appears on sites you enable in the popup.

## How to load

1. Open Chrome.
2. Go to `chrome://extensions`.
3. Enable Developer mode.
4. Click `Load unpacked`.
5. Select this project folder.

## How to use

1. Open any page.
2. Click the extension icon.
3. Enable highlighting for the current site.
4. Add words you already know.
5. Unknown Japanese words on the page will be underlined.
6. Click a highlighted word on the page to add it to your known words.

## Notes

- This project uses plain HTML, CSS, and JavaScript.
- Known words and settings stay in your browser.
