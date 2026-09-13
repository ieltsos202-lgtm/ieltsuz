// Normalises every mock test in public/mocks:
//   1. repairs UTF-8 -> cp1251 -> UTF-8 mojibake ("вЂ“" -> "–")
//   2. strips third-party branding / Telegram promos
//   3. sets a consistent <title>
//   4. injects the shared IELTSUZ stylesheet + bridge script
// Usage: node scripts/fix-mocks.mjs [--dry]

import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const DRY = process.argv.includes("--dry");
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "mocks");

// ---- mojibake repair -------------------------------------------------------
const cp1251 = new TextDecoder("windows-1251");
const charToByte = new Map();
for (let b = 0; b < 256; b++) {
  const ch = cp1251.decode(new Uint8Array([b]));
  if (!charToByte.has(ch)) charToByte.set(ch, b);
}
const utf8Strict = new TextDecoder("utf-8", { fatal: true });
// Runs of characters that all exist in cp1251 and start with a typical UTF-8 lead byte remnant.
const RUN = /[\u0402\u0403\u201A\u0453\u201E\u2026\u2020\u2021\u20AC\u2030\u0409\u2039\u040A\u040C\u040B\u040F\u0452\u2018\u2019\u201C\u201D\u2022\u2013\u2014\u2122\u0459\u203A\u045A\u045C\u045B\u045F\u00A0\u040E\u045E\u0408\u00A4\u0490\u00A6\u00A7\u0401\u00A9\u0404\u00AB\u00AC\u00AD\u00AE\u0407\u00B0\u00B1\u0406\u0456\u0491\u00B5\u00B6\u00B7\u0451\u2116\u0454\u00BB\u0458\u0405\u0455\u0457\u0410-\u044F]{2,}/g;
function repairMojibake(text) {
  let fixes = 0;
  const out = text.replace(RUN, (run) => {
    // Must look like a double-encoded sequence: starts with Р/С/Г/Р’/в etc (lead bytes 0xC0-0xEF map to these)
    if (!/^[\u0420\u0421\u0413\u0432\u0430-\u0433\u0410-\u0417]/.test(run)) return run;
    const bytes = new Uint8Array(run.length);
    for (let i = 0; i < run.length; i++) {
      const b = charToByte.get(run[i]);
      if (b === undefined) return run;
      bytes[i] = b;
    }
    try {
      const decoded = utf8Strict.decode(bytes);
      if (/[\u0400-\u04FF]/.test(decoded)) return run; // real Cyrillic, leave it
      fixes++;
      return decoded;
    } catch {
      return run;
    }
  });
  // U+2018 (‘) is E2 80 98; 0x98 is undefined in cp1251 so it was dropped, leaving a bare "вЂ".
  let out2 = out.replace(/\u0432\u0402\u0098?/g, () => { fixes++; return "\u2018"; });
  // Latin-1 flavour: "â€™" style where each char's code point is the original byte.
  out2 = out2.replace(/[\u00C2-\u00F4][\u0080-\u00BF]{1,3}/g, (run) => {
    try {
      const decoded = utf8Strict.decode(Uint8Array.from([...run].map((c) => c.charCodeAt(0))));
      fixes++;
      return decoded;
    } catch {
      return run;
    }
  });
  return { out: out2, fixes };
}

// ---- branding --------------------------------------------------------------
const TEXT_REPLACEMENTS = [
  [/IELTS\s*by\s*Abdullokh/gi, "IELTSUZ"],
  [/@IELTSbyAbdullokh/gi, "@ieltsuz"],
  [/prepared sincerely by Abdullokh/gi, "prepared by IELTSUZ"],
  [/\bAbdullokh\b/g, "IELTSUZ"],
  [/IELTS\s*CD\s*MATERIALS/gi, "IELTSUZ"],
  [/IELTS\s*CDI\s*Listening\s*Practice/gi, "IELTSUZ Listening Practice"],
  [/IELTS\s*CDI\b/g, "IELTSUZ"],
  [/@blackcat\w*/gi, "@ieltsuz"],
  [/@realexamielts\w*/gi, "@ieltsuz"],
  [/@worldnet\w*/gi, "@ieltsuz"],
  [/\bblackcat\b/gi, "IELTSUZ"],
  [/\brealexamielts\b/gi, "IELTSUZ"],
  [/\bworldnet(\s*ielts)?\b/gi, "IELTSUZ"],
  [/IELTS\s*OS\b/g, "IELTSUZ"],
  [/https?:\/\/t\.me\/[A-Za-z0-9_]+/g, "https://t.me/ieltsosuzb"],
  [/https?:\/\/(www\.)?pereletun\.xyz[^"'\s)]*/g, "#"],
  [/Prepared by [^|<"]{2,40}\s*\|\s*Telegram:[^|<"]{2,40}(\s*\|\s*Free IELTS Practice)?/g, "IELTSUZ — ieltsuz.com"],
  [/Join us on Telegram[^<]{0,80}/g, "Practice more at IELTSUZ"],
  [/Want more free tests\s*&amp;\s*daily IELTS tips\?[^<]{0,60}/g, "Keep practising at IELTSUZ."],
];

function titleFor(file) {
  const m = file.match(/^([LR])(\d+)\.html$/i);
  if (!m) return null;
  const kind = m[1].toUpperCase() === "L" ? "Listening" : "Reading";
  return `IELTSUZ \u2013 ${kind} Test ${m[2]}`;
}

const INJECT_MARK = "<!-- ieltsuz-shared -->";
const INJECT = `${INJECT_MARK}\n<link rel="stylesheet" href="ieltsuz-mock.css">\n<script src="ieltsuz-bridge.js" defer></script>\n`;

// ---- main ------------------------------------------------------------------
const files = readdirSync(ROOT).filter((f) => /^[LR]\d+\.html$/i.test(f)).sort();
const summary = [];
for (const f of files) {
  const path = join(ROOT, f);
  let html = readFileSync(path, "utf8");
  const before = html;
  const notes = [];

  const { out, fixes } = repairMojibake(html);
  if (fixes) { html = out; notes.push(`mojibake x${fixes}`); }

  let brand = 0;
  for (const [re, rep] of TEXT_REPLACEMENTS) {
    html = html.replace(re, () => { brand++; return rep; });
  }
  if (brand) notes.push(`brand x${brand}`);

  if (!/<meta\s+charset/i.test(html)) {
    html = html.replace(/<head([^>]*)>/i, `<head$1>\n<meta charset="UTF-8">`);
    notes.push("charset");
  }

  const title = titleFor(f);
  if (title) {
    if (/<title>[\s\S]*?<\/title>/i.test(html)) html = html.replace(/<title>[\s\S]*?<\/title>/i, `<title>${title}</title>`);
    else html = html.replace(/<\/head>/i, `<title>${title}</title>\n</head>`);
    notes.push("title");
  }

  if (!html.includes(INJECT_MARK)) {
    if (/<\/body>/i.test(html)) html = html.replace(/<\/body>/i, `${INJECT}</body>`);
    else html += INJECT;
    notes.push("inject");
  }

  // Remaining external anchors (report only)
  const ext = [...html.matchAll(/<a[^>]+href="(https?:\/\/[^"]+)"/gi)]
    .map((m) => m[1])
    .filter((u) => !/t\.me\/ieltsosuzb|w3\.org/.test(u));
  if (ext.length) notes.push(`ext-links: ${[...new Set(ext)].slice(0, 3).join(", ")}`);

  if (html !== before && !DRY) writeFileSync(path, html, "utf8");
  summary.push(`${f.padEnd(9)} ${notes.join(" | ") || "unchanged"}`);
}
console.log(summary.join("\n"));
console.log(`\n${files.length} files processed${DRY ? " (dry run)" : ""}.`);
