# Chunk Translator

A static web tool that slices large source text into chunks and translates them without dropping a line — (no server provided).

## Usage
1. Enter your LLM API key (it is **not** sent to any server).
2. (Optional) Generate a summary for context‑aware translation.
3. Split the text into chunks.
4. Translate.

## For Developers
- No build step, no tests, no package manager.
- Maintain these files when updating features:
  - `index.html`
  - `styles.css`
  - `app.js`
- Run a hot‑reload dev server with:
  - `npx live-server`
