# AGENTS.md

## Project
Tango Highlighter is a plain HTML/CSS/JavaScript Chrome extension for Japanese reading practice on `aozora.gr.jp`.

## Repo layout
- `manifest.json`: extension manifest
- `content.js`: page highlighting logic
- `content.css`: highlight styles
- `popup.html`: popup UI
- `popup.js`: popup behavior
- `default-known-words.js`: starter word list
- `search-engines.js`: search engine data
- `icon/`: extension icons

## Rules
- Keep changes small and focused.
- Do not add a build step unless asked.
- Prefer plain browser APIs and existing project patterns.
- Preserve Chrome extension compatibility.
- Store user data in `chrome.storage.local` only when needed.
- If the task is performance optimization, measure first and optimize after you have data.

## Verification
- There is no automated test suite or build command.
- Validate changes by reloading the unpacked extension in Chrome and checking the popup plus a supported Aozora page.

## Notes
- The extension is configured for broad page matching unless the user asks to narrow it.
- Keep user-facing text concise and simple.
