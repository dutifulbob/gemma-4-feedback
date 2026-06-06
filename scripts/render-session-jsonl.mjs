#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);

if (args.length < 2 || args.includes("--help") || args.includes("-h")) {
  process.stdout.write(`usage: render-session-jsonl <session.jsonl> <output.md>\n`);
  process.exit(args.length < 2 ? 2 : 0);
}

const [inputPath, outputPath] = args;
const entries = readJsonl(inputPath);
const markdown = renderSession(entries, inputPath, outputPath);

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, markdown, "utf8");

function readJsonl(filePath) {
  return fs
    .readFileSync(filePath, "utf8")
    .split(/\r?\n/u)
    .filter(Boolean)
    .map((line, index) => {
      try {
        return JSON.parse(line);
      } catch (error) {
        throw new Error(`failed to parse ${filePath}:${String(index + 1)}: ${error.message}`);
      }
    });
}

function renderSession(entries, sourcePath, outputPath) {
  const session = entries.find((entry) => entry.type === "session");
  const messages = entries.filter((entry) => entry.type === "message");
  const modelChanges = entries.filter((entry) => entry.type === "model_change");
  const thinkingChanges = entries.filter((entry) => entry.type === "thinking_level_change");
  const assistantMessages = messages.filter((entry) => entry.message?.role === "assistant");
  const totalUsage = assistantMessages
    .map((entry) => entry.message?.usage)
    .filter((usage) => usage !== undefined);

  const lines = [];
  lines.push(`# ${titleFromPath(outputPath)}`);
  lines.push("");
  lines.push("Rendered from a Pi JSONL session transcript.");
  lines.push("");
  lines.push("## Metadata");
  lines.push("");
  lines.push("| Field | Value |");
  lines.push("| --- | --- |");
  lines.push(row("Source", sourcePath));
  if (session !== undefined) {
    lines.push(row("Session id", session.id));
    lines.push(row("Started", session.timestamp));
    lines.push(row("Working directory", session.cwd));
  }
  for (const change of modelChanges) {
    lines.push(row("Provider", change.provider));
    lines.push(row("Model", change.modelId));
  }
  for (const change of thinkingChanges) {
    lines.push(row("Pi thinking level", change.thinkingLevel));
  }
  for (const usage of totalUsage) {
    lines.push(row("Prompt tokens", usage.input));
    lines.push(row("Generated tokens", usage.output));
    lines.push(row("Total tokens", usage.totalTokens));
  }
  lines.push("");
  lines.push("## Transcript");
  lines.push("");

  for (const entry of messages) {
    renderMessage(lines, entry);
  }

  return `${lines.join("\n")}\n`;
}

function renderMessage(lines, entry) {
  const message = entry.message;
  if (message === undefined) {
    return;
  }
  const role = message.role ?? "message";
  const timestamp = entry.timestamp === undefined ? "" : ` - ${entry.timestamp}`;
  lines.push(`### ${role}${timestamp}`);
  lines.push("");

  for (const part of message.content ?? []) {
    if (part.type === "text") {
      renderTextPart(lines, role, part.text ?? "");
    } else if (part.type === "thinking") {
      renderThinkingPart(lines, part);
    } else if (part.type === "toolCall") {
      renderToolCall(lines, part);
    } else {
      lines.push(`#### ${part.type ?? "content"}`);
      lines.push("");
      lines.push(fenced(JSON.stringify(part, null, 2), "json"));
      lines.push("");
    }
  }

  if (message.usage !== undefined || message.stopReason !== undefined || message.responseId !== undefined) {
    lines.push("#### Message metadata");
    lines.push("");
    lines.push(fenced(JSON.stringify(messageMetadata(message), null, 2), "json"));
    lines.push("");
  }
}

function renderTextPart(lines, role, text) {
  const language = role === "user" ? "markdown" : "text";
  lines.push(fenced(text, language));
  lines.push("");
}

function renderThinkingPart(lines, part) {
  const thinking = part.thinking ?? "";
  lines.push(
    `<details open><summary>Thinking (${String(thinking.length)} chars, ${String(lineCount(thinking))} lines)</summary>`
  );
  lines.push("");
  lines.push(fenced(thinking, "text"));
  lines.push("");
  lines.push("</details>");
  lines.push("");
}

function renderToolCall(lines, part) {
  lines.push(`#### Tool call: ${part.name ?? "unknown"}`);
  lines.push("");
  const payload = {
    id: part.id,
    name: part.name,
    arguments: part.arguments
  };
  lines.push(fenced(JSON.stringify(withoutUndefined(payload), null, 2), "json"));
  lines.push("");
}

function messageMetadata(message) {
  return withoutUndefined({
    api: message.api,
    provider: message.provider,
    model: message.model,
    usage: message.usage,
    stopReason: message.stopReason,
    responseId: message.responseId
  });
}

function titleFromPath(filePath) {
  const parts = path.basename(filePath, path.extname(filePath)).split("-");
  const date =
    parts.length >= 3 && /^\d{4}$/u.test(parts[0]) ? `${parts[0]}-${parts[1]}-${parts[2]}` : "";
  const words = (date === "" ? parts : parts.slice(3)).map(titleWord);
  return [date, ...words].filter(Boolean).join(" ");
}

function titleWord(value) {
  if (value === "openclaw") {
    return "OpenClaw";
  }
  if (value === "gemma4") {
    return "Gemma 4";
  }
  if (/^\d+b$/u.test(value)) {
    return value.toUpperCase();
  }
  return value;
}

function fenced(value, language) {
  const text = String(value);
  const longestFence = Math.max(2, ...[...text.matchAll(/`+/gu)].map((match) => match[0].length));
  const fence = "`".repeat(longestFence + 1);
  return `${fence}${language}\n${text}\n${fence}`;
}

function lineCount(value) {
  if (value.length === 0) {
    return 0;
  }
  return value.split(/\r?\n/u).length;
}

function row(name, value) {
  return `| ${escapeTable(name)} | ${escapeTable(String(value ?? ""))} |`;
}

function escapeTable(value) {
  return value.replaceAll("|", "\\|").replaceAll("\n", "<br>");
}

function withoutUndefined(value) {
  return Object.fromEntries(Object.entries(value).filter(([, entryValue]) => entryValue !== undefined));
}
