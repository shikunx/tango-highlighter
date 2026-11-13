# AGENTS.md

## Project
Tango Highlighter is a plain HTML/CSS/JavaScript Chrome extension for Japanese reading practice on `aozora.gr.jp`.

## Rules
- Keep changes small and focused.
- Do not add a build step unless asked.
- Prefer plain browser APIs and existing project patterns.
- Preserve Chrome extension compatibility.
- Store user data in `chrome.storage.local` only when needed.
- When vendoring code or assets, verify the actual runtime file paths and data format before wiring them in.
- If the task is performance optimization, measure first and optimize after you have data.
- Bump the manifest version only on a release.

## Verification
- There is no automated test suite or build command.
- Validate changes by reloading the unpacked extension in Chrome and checking the popup plus a supported Aozora page.

## Notes
- The extension matches all pages unless the user asks to narrow it.
- Store known words as the exact strings users marked; do not normalize them to dictionary forms.
- Keep user-facing text concise and simple.
- Write commit messages and CHANGELOG entries in English.
