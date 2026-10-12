# Cowork Exporter

A one-click Mac app that gathers the Cowork tasks the Claude desktop app ran
on your computer into one folder of readable Markdown.

The whole app is one script: [`cowork-exporter.js`](cowork-exporter.js)
(~220 lines of JavaScript for Automation, run by macOS's built-in `osascript`).

## What it does

1. Reads task records from
   `~/Library/Application Support/Claude/local-agent-mode-sessions/`.
2. Creates `Cowork Export <date> <time>` on your Desktop, with one folder per
   task:
   - `conversation.md` with your messages and Claude's replies (tool calls
     shown as one line each)
   - `outputs/` with the files Claude produced, and `uploads/` with the files
     you attached
   - `raw-transcript.jsonl`, the original transcript
3. Writes a `README.md` index and opens the folder.

## What it does not do

- **No network access.** There is no `fetch`, `curl`, or URL anywhere in the
  script.
- **Never modifies or deletes Claude's data.** It only reads it and copies it.
- Only writes inside the new export folder on your Desktop.

## Scope

It covers tasks the **desktop app** ran on this Mac. Tasks run on claude.ai
(web) are stored on Anthropic's servers, not on your computer, so they won't
appear here.

## Verify the release matches this source

The app is an unsigned AppleScript applet, so its script is readable:

```sh
osadecompile "Cowork Exporter.app"      # prints the same source as cowork-exporter.js
```

or open the app in **Script Editor**. To build it yourself instead:

```sh
./build.sh    # osacompile -l JavaScript → "Cowork Exporter.app" + zip
```

## First launch

macOS blocks unsigned apps by default. Right-click the app → **Open**, or
System Settings → Privacy & Security → **Open Anyway**. It will also ask for
access to your Desktop, which it needs to write the export.
