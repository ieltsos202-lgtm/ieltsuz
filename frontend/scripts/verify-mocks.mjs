// Verifies that every mock test (a) has the shared IELTSUZ assets injected and
// (b) exposes at least one grading hook that ieltsuz-bridge.js can detect.
// Usage: node scripts/verify-mocks.mjs
import { readdirSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "mocks");

// Must mirror ieltsuz-bridge.js
const KEY_GLOBALS = ["correctAnswers", "CORRECT_ANSWERS", "answerKey", "ANSWER_KEY", "answerMap", "_answerMap", "questionMeta", "ANSWERS", "answers", "solutions", "key", "KEY"];
const FN_NAMES = ["checkAnswers", "checkAllAnswers", "submitTest", "submitAnswers", "showResults", "showResultsModal", "openResultModal", "showFeedback", "confirmSubmitModal", "buildResults", "deliverTest", "finishTest", "gradeTest", "calculateScore"];
const MODAL_IDS = ["result-modal", "results-modal", "resultModal", "resultsModal", "resultModalOverlay", "screen-results", "completion-screen", "feedback-panel", "feedbackPanel"];

const files = readdirSync(ROOT).filter((f) => /^[LR]\d+\.html$/.test(f)).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
const problems = [];

for (const f of files) {
  const s = readFileSync(join(ROOT, f), "utf8");
  const hooks = [];

  if (KEY_GLOBALS.some((n) => new RegExp(`(?:const|let|var|window\\.)\\s*${n}\\s*=`).test(s))) hooks.push("key-global");
  if (/window\._checkResults/.test(s)) hooks.push("_checkResults");
  if (FN_NAMES.some((n) => new RegExp(`(?:function\\s+${n}\\s*\\(|window\\.${n}\\s*=)`).test(s))) hooks.push("graded-fn");
  if (MODAL_IDS.some((id) => s.includes(`id="${id}"`))) hooks.push("result-modal");
  if (/classList\.add\((['"`])(correct|incorrect)/.test(s)) hooks.push("correct-classes");
  if (/id="(result-details|results-details)"/.test(s) || /class="[^"]*results-details-container/.test(s)) hooks.push("result-table");

  const issues = [];
  if (!s.includes("ieltsuz-shared")) issues.push("MISSING inject");
  if (!s.includes("ieltsuz-bridge.js")) issues.push("MISSING bridge");
  if (!s.includes("ieltsuz-mock.css")) issues.push("MISSING css");
  if (!/<meta\s+charset/i.test(s)) issues.push("MISSING charset");
  if (!/<title>IELTSUZ/.test(s)) issues.push("BAD title");
  if (!hooks.length) issues.push("NO GRADING HOOK");
  // Grading needs either a key/table to read answers from, or the minified bridge globals
  const canReadAnswers = hooks.some((h) => ["key-global", "_checkResults", "result-table"].includes(h));
  if (!canReadAnswers) issues.push("NO ANSWER SOURCE");

  const status = issues.length ? `!! ${issues.join(", ")}` : "ok";
  console.log(`${f.padEnd(9)} ${status.padEnd(34)} hooks: ${hooks.join(",") || "-"}`);
  if (issues.length) problems.push(f);
}

console.log(`\n${files.length} files, ${problems.length} with problems${problems.length ? ": " + problems.join(", ") : ""}`);
process.exitCode = problems.length ? 1 : 0;
