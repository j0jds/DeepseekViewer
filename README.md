# DeepSeek Chat Viewer

Local viewer for the DeepSeek data export (Settings → Data → Export).
Everything runs on your computer: the server listens only on `127.0.0.1` and nothing is sent to the internet.

## How to run

Requires **Python 3.8+** (no extra libraries).

- **Windows:** double-click `iniciar.bat`
- **macOS / Linux:** `./iniciar.sh` (or `python3 server.py`)

The browser opens at `http://127.0.0.1:8765`. To stop, close the terminal window (or press Ctrl+C).

## Choosing the export

- By default it looks for a `.zip` or export folder inside `dados/` (already includes yours).
- Or pass the path: `python3 server.py my-export.zip` / `python3 server.py extracted_folder`
- Or, with the program open, **drag the .zip into the window** (or use the folder button at the bottom of the list).
  To load a new export, just repeat this — no need to extract anything.

Options: `--port 9000`, `--no-browser`.

## What the interface does

- List of all chats, grouped by date, with pinned chats on top; sorting by recent / oldest / largest
- **Search across all content** (ignores accents and case; multiple terms = all must appear), with a snippet of the result in the list and terms highlighted when opening the chat
- Responses rendered in Markdown (headings, lists, tables, code with copy button)
- Collapsible **Process** block: reasoning (thinking), web searches and pages read, with links
- Chats with regenerated/edited responses: `‹ 1/2 ›` arrows to navigate between versions
- Copy or download any chat as `.md`
- Light/dark theme, responsive layout, `/` shortcut to search

## Privacy

- The `dados/` folder contains your original export (includes email/phone in `user.json`). Do not share this folder; delete the `.zip` from it if you distribute the program.
- The interface only shows your name (from the Google profile, if present). Email and phone are not displayed.
- The server rejects requests whose `Host` is not localhost (protection against DNS rebinding).

## Supported format

`export_format_version: 3` — `chat_sessions/*.json` with messages in a tree (`parent_id`) and fragments
`REQUEST`, `RESPONSE`, `THINK`, `TOOL_SEARCH`, `TOOL_OPEN`, `CONTENT_RISK`. Unknown fragments
(files, new types) appear in a generic format instead of being ignored.