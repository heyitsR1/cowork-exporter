// Cowork Exporter — copies every Claude Desktop Cowork task into one folder of
// readable Markdown, with the files Claude produced and the files attached.
//
// Cowork keeps tasks on this computer, not on claude.ai:
//   ~/Library/Application Support/Claude/local-agent-mode-sessions/<account>/<org>/
//     local_<id>.json                       task record (title, dates, cliSessionId)
//     local_<id>/.claude/projects/*/<cliSessionId>.jsonl   the conversation
//     local_<id>/outputs/   local_<id>/uploads/
//
// Read-only on Claude's data. Build: ./build.sh  Test: COWORK_EXPORT_OUT=/tmp/x COWORK_EXPORT_QUIET=1 osascript -l JavaScript cowork-exporter.js

ObjC.import("Foundation");

const app = Application.currentApplication();
app.includeStandardAdditions = true;

const fm = $.NSFileManager.defaultManager;
const env = ObjC.deepUnwrap($.NSProcessInfo.processInfo.environment);
const HOME = ObjC.unwrap($.NSHomeDirectory());
const ROOT = `${HOME}/Library/Application Support/Claude/local-agent-mode-sessions`;
const QUIET = env.COWORK_EXPORT_QUIET === "1";

function isDir(p) {
  const r = Ref();
  return fm.fileExistsAtPathIsDirectory(p, r) && r[0];
}
function ls(p) {
  const a = fm.contentsOfDirectoryAtPathError(p, null);
  return a.isNil() ? [] : ObjC.deepUnwrap(a);
}
function read(p) {
  const s = $.NSString.stringWithContentsOfFileEncodingError(p, $.NSUTF8StringEncoding, null);
  return s.isNil() ? null : ObjC.unwrap(s);
}
function write(p, text) {
  $(text).writeToFileAtomicallyEncodingError(p, true, $.NSUTF8StringEncoding, null);
}
function mkdirp(p) {
  fm.createDirectoryAtPathWithIntermediateDirectoriesAttributesError(p, true, $(), null);
}
function sizeOf(p) {
  const a = fm.attributesOfItemAtPathError(p, null);
  return a.isNil() ? 0 : ObjC.unwrap(a.fileSize);
}

function say(msg) {
  if (QUIET) console.log(msg);
  else app.displayDialog(msg, { buttons: ["OK"], defaultButton: "OK", withTitle: "Cowork Exporter" });
}

function safeName(s) {
  return String(s || "Untitled").replace(/[\/\\:*?"<>|\n\r\t]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 80) || "Untitled";
}
function day(ms) {
  const d = new Date(ms || 0);
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
function stamp(ms) {
  const d = new Date(ms || 0);
  return `${day(ms)} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

// Every local_<id>.json task record, a few levels under ROOT.
function findTaskRecords(dir, depth) {
  const found = [];
  for (const name of ls(dir)) {
    const p = `${dir}/${name}`;
    if (/^local_[^/]+\.json$/.test(name)) found.push(p);
    else if (depth > 0 && isDir(p) && !name.startsWith(".") && !name.startsWith("local_") && name !== "skills-plugin") {
      found.push(...findTaskRecords(p, depth - 1));
    }
  }
  return found;
}

// The main conversation: <cliSessionId>.jsonl if present, else the largest .jsonl.
function findTranscript(taskDir, cliSessionId) {
  const projects = `${taskDir}/.claude/projects`;
  let best = null;
  let bestSize = -1;
  for (const sub of ls(projects)) {
    const d = `${projects}/${sub}`;
    if (!isDir(d)) continue;
    for (const f of ls(d)) {
      if (!f.endsWith(".jsonl")) continue;
      if (cliSessionId && f === `${cliSessionId}.jsonl`) return `${d}/${f}`;
      const size = sizeOf(`${d}/${f}`);
      if (size > bestSize) { best = `${d}/${f}`; bestSize = size; }
    }
  }
  return best;
}

function blocksOf(content) {
  if (typeof content === "string") return [{ type: "text", text: content }];
  return Array.isArray(content) ? content : [];
}

function toolLine(b) {
  const input = b.input || {};
  const hint = input.description || input.command || input.file_path || input.path || input.url || input.query || input.pattern || "";
  return `> 🔧 ${b.name}${hint ? ` — ${String(hint).replace(/\s+/g, " ").slice(0, 160)}` : ""}`;
}

function renderTranscript(jsonl) {
  const out = [];
  let lastRole = null;
  for (const line of jsonl.split("\n")) {
    if (!line.trim()) continue;
    let e;
    try { e = JSON.parse(line); } catch (_) { continue; }
    if ((e.type !== "user" && e.type !== "assistant") || e.isSidechain || e.isMeta || !e.message) continue;

    const parts = [];
    for (const b of blocksOf(e.message.content)) {
      if (b.type === "text" && b.text && b.text.trim()) {
        if (e.type === "user" && /^\s*<(command-|local-command|system-reminder)/.test(b.text)) continue;
        parts.push(b.text.trim());
      } else if (b.type === "tool_use") {
        parts.push(toolLine(b));
      }
      // thinking and tool_result blocks are left out — they are noise in a reading copy.
    }
    if (parts.length === 0) continue;

    const role = e.type === "user" ? "You" : "Claude";
    if (role !== lastRole) {
      out.push(`\n## ${role}${e.timestamp ? ` · ${stamp(Date.parse(e.timestamp))}` : ""}\n`);
      lastRole = role;
    }
    out.push(parts.join("\n\n") + "\n");
  }
  return out.join("\n");
}

function copyFolder(src, dest) {
  if (!isDir(src) || ls(src).length === 0) return 0;
  fm.copyItemAtPathToPathError(src, dest, null);
  return ls(src).length;
}

function main() {
  if (!isDir(ROOT)) {
    say("No Cowork data found on this Mac.\n\nExpected it at:\n" + ROOT + "\n\nCowork tasks only exist on the computer where the Claude desktop app ran them.");
    return;
  }

  const records = findTaskRecords(ROOT, 3);
  if (records.length === 0) {
    say("The Cowork folder exists but holds no tasks.");
    return;
  }

  const outRoot = env.COWORK_EXPORT_OUT || `${HOME}/Desktop/Cowork Export ${stamp(Date.now()).replace(":", ".")}`;
  mkdirp(outRoot);

  const index = [];
  const used = {};
  let exported = 0;
  let empty = 0;

  for (const recPath of records) {
    let rec;
    try { rec = JSON.parse(read(recPath) || "{}"); } catch (_) { continue; }
    const taskDir = recPath.replace(/\.json$/, "");
    const transcriptPath = findTranscript(taskDir, rec.cliSessionId);
    const body = transcriptPath ? renderTranscript(read(transcriptPath) || "") : "";

    let folder = `${day(rec.createdAt)} ${safeName(rec.title)}`;
    used[folder] = (used[folder] || 0) + 1;
    if (used[folder] > 1) folder += ` (${used[folder]})`;
    const dest = `${outRoot}/${folder}`;
    mkdirp(dest);

    const header = [
      `# ${rec.title || "Untitled task"}`,
      "",
      `- Started: ${stamp(rec.createdAt)}`,
      `- Last activity: ${stamp(rec.lastActivityAt || rec.createdAt)}`,
      rec.model ? `- Model: ${rec.model}` : null,
      rec.userSelectedFolders && rec.userSelectedFolders.length ? `- Folders: ${rec.userSelectedFolders.join(", ")}` : null,
      rec.isArchived ? "- Archived in Claude" : null,
      "",
    ].filter((l) => l !== null).join("\n");

    write(`${dest}/conversation.md`, header + (body || "\n_No conversation transcript was found for this task._\n"));
    const outputs = copyFolder(`${taskDir}/outputs`, `${dest}/outputs`);
    const uploads = copyFolder(`${taskDir}/uploads`, `${dest}/uploads`);
    if (transcriptPath) fm.copyItemAtPathToPathError(transcriptPath, `${dest}/raw-transcript.jsonl`, null);

    if (!body) empty += 1;
    exported += 1;
    index.push({ when: rec.lastActivityAt || rec.createdAt || 0, line: `- [${rec.title || "Untitled task"}](<${folder}/conversation.md>) — ${stamp(rec.lastActivityAt || rec.createdAt)}${outputs ? ` · ${outputs} output file(s)` : ""}${uploads ? ` · ${uploads} upload(s)` : ""}` });
  }

  index.sort((a, b) => b.when - a.when);
  write(`${outRoot}/README.md`, `# Cowork export — ${day(Date.now())}\n\n${exported} task(s), newest first.\n\n${index.map((i) => i.line).join("\n")}\n`);

  if (!QUIET) app.doShellScript(`open ${JSON.stringify(outRoot)}`);
  say(`Exported ${exported} Cowork task(s) to:\n${outRoot}` + (empty ? `\n\n${empty} had no readable conversation.` : ""));
}

main();
