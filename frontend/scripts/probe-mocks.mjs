// Quick structural probe of mock tests: answer-key globals, grading functions, result containers.
// Usage: node scripts/probe-mocks.mjs L15 R8 ...   (no args = all)
import { readdirSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "mocks");
const args = process.argv.slice(2);
const files = (args.length ? args.map((a) => `${a}.html`) : readdirSync(ROOT).filter((f) => /^[LR]\d+\.html$/.test(f))).sort();

const uniq = (it) => [...new Set(it)];
for (const f of files) {
  const s = readFileSync(join(ROOT, f), "utf8");
  const keys = uniq([...s.matchAll(/(?:const|let|var|window\.)\s*([A-Za-z_]*(?:answer|key|solution)[A-Za-z_]*)\s*=/gi)].map((m) => m[1]));
  const fns = uniq([...s.matchAll(/function\s+([a-zA-Z]*(?:check|submit|grade|result|score|finish|mark|deliver)[a-zA-Z]*)\s*\(/gi)].map((m) => m[1]));
  const cfns = uniq([...s.matchAll(/(?:const|let|var)\s+([a-zA-Z]*(?:check|submit|grade|result|score|finish|mark|deliver)[a-zA-Z]*)\s*=\s*(?:\(|function|async)/gi)].map((m) => m[1]));
  const ids = uniq([...s.matchAll(/id="([a-zA-Z_-]*(?:result|score|modal|complet)[a-zA-Z_-]*)"/gi)].map((m) => m[1]));
  const inputs = uniq([...s.matchAll(/(name|id|data-q|data-question)="(q?\d+)"/g)].map((m) => m[1])).join(",");
  console.log(`${f}\n  keys: ${keys.join(", ")}\n  fns: ${fns.join(", ")}${cfns.length ? `\n  const-fns: ${cfns.join(", ")}` : ""}\n  ids: ${ids.join(", ")}\n  inputs-by: ${inputs}`);
}
