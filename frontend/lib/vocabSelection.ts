// Injects an in-place "Add to Vocabulary" popup into a same-origin test iframe.
// When the learner selects an unknown word/phrase while reading or listening, a
// small floating button appears. Clicking it looks the word up (translation +
// pronunciation + examples), saves it, and confirms inline with a speaker.

export interface VocabLookupResult {
  word?: string;
  translation?: string | null;
  phonetic?: string | null;
  already_saved?: boolean;
}

type LookupFn = (word: string, context: string) => Promise<VocabLookupResult>;

const MAX_WORDS = 4;

function speak(word: string) {
  try {
    const synth = window.speechSynthesis;
    if (!synth) return;
    synth.cancel();
    const u = new SpeechSynthesisUtterance(word);
    u.lang = "en-US";
    u.rate = 0.9;
    synth.speak(u);
  } catch {
    /* ignore */
  }
}

function sentenceContext(range: Range, selected: string): string {
  const container =
    range.commonAncestorContainer.nodeType === Node.TEXT_NODE
      ? range.commonAncestorContainer.parentElement
      : (range.commonAncestorContainer as HTMLElement);
  const text = (container?.textContent || selected).replace(/\s+/g, " ").trim();
  return text.slice(0, 400);
}

export function attachVocabSelection(
  doc: Document,
  win: Window,
  lookup: LookupFn
): () => void {
  // Avoid double-attaching to the same document.
  if ((doc as any).__ieltsuzVocab) return (doc as any).__ieltsuzVocab;

  const pop = doc.createElement("div");
  pop.id = "ieltsuz-vocab-pop";
  pop.style.cssText = [
    "position:absolute",
    "z-index:2147483647",
    "display:none",
    "font-family:Inter,Arial,sans-serif",
    "font-size:13px",
    "line-height:1",
    "user-select:none",
    "-webkit-user-select:none",
  ].join(";");
  doc.body.appendChild(pop);

  let currentWord = "";
  let currentContext = "";

  const hide = () => {
    pop.style.display = "none";
    pop.innerHTML = "";
  };

  const renderButton = () => {
    pop.innerHTML = "";
    const btn = doc.createElement("button");
    btn.type = "button";
    btn.textContent = "+ Lug'atga qo'shish";
    btn.style.cssText = [
      "cursor:pointer",
      "border:none",
      "border-radius:9999px",
      "padding:8px 14px",
      "font-weight:600",
      "font-size:13px",
      "color:#fff",
      "background:linear-gradient(135deg,#6366f1,#8b5cf6)",
      "box-shadow:0 4px 14px rgba(99,102,241,0.45)",
      "white-space:nowrap",
    ].join(";");
    // Use mousedown so the text selection isn't cleared before we read it.
    btn.addEventListener("mousedown", (e) => {
      e.preventDefault();
      e.stopPropagation();
      void onAdd();
    });
    pop.appendChild(btn);
  };

  const renderResult = (label: string, color: string, word?: string) => {
    pop.innerHTML = "";
    const chip = doc.createElement("div");
    chip.style.cssText = [
      "display:flex",
      "align-items:center",
      "gap:8px",
      "border-radius:9999px",
      "padding:8px 12px",
      "font-size:13px",
      "font-weight:600",
      "color:#fff",
      `background:${color}`,
      "box-shadow:0 4px 14px rgba(0,0,0,0.25)",
      "white-space:nowrap",
      "max-width:320px",
    ].join(";");
    const text = doc.createElement("span");
    text.textContent = label;
    text.style.cssText = "overflow:hidden;text-overflow:ellipsis";
    chip.appendChild(text);
    if (word) {
      const spk = doc.createElement("button");
      spk.type = "button";
      spk.textContent = "🔊";
      spk.style.cssText =
        "cursor:pointer;border:none;background:rgba(255,255,255,0.2);border-radius:50%;width:24px;height:24px;color:#fff;font-size:12px;flex:none";
      spk.addEventListener("mousedown", (e) => {
        e.preventDefault();
        e.stopPropagation();
        speak(word);
      });
      chip.appendChild(spk);
    }
    pop.appendChild(chip);
  };

  const onAdd = async () => {
    if (!currentWord) return;
    const word = currentWord;
    renderResult("Qo'shilmoqda…", "#475569");
    try {
      const res = await lookup(word, currentContext);
      const tr = res.translation ? `: ${res.translation}` : "";
      const prefix = res.already_saved ? "Allaqachon bor" : "✓ Qo'shildi";
      renderResult(`${prefix}${tr}`, "#10b981", res.word || word);
      speak(res.word || word);
      window.setTimeout(hide, 3500);
    } catch {
      renderResult("✗ Xatolik", "#ef4444");
      window.setTimeout(hide, 2500);
    }
  };

  const position = (range: Range) => {
    const rect = range.getBoundingClientRect();
    if (!rect || (rect.width === 0 && rect.height === 0)) return false;
    const top = rect.top + win.scrollY - 44;
    const left = rect.left + win.scrollX;
    pop.style.top = `${Math.max(4, top)}px`;
    pop.style.left = `${Math.max(4, left)}px`;
    return true;
  };

  const onMouseUp = () => {
    const sel = win.getSelection();
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) {
      hide();
      return;
    }
    const raw = sel.toString().trim();
    const wordCount = raw.split(/\s+/).filter(Boolean).length;
    // Only offer for a single word or a short phrase made of letters.
    if (!raw || raw.length > 60 || wordCount > MAX_WORDS || !/[A-Za-z]/.test(raw)) {
      hide();
      return;
    }
    const range = sel.getRangeAt(0);
    currentWord = raw;
    currentContext = sentenceContext(range, raw);
    renderButton();
    pop.style.display = "block";
    if (!position(range)) hide();
  };

  const onDocMouseDown = (e: MouseEvent) => {
    if (!pop.contains(e.target as Node)) hide();
  };

  doc.addEventListener("mouseup", onMouseUp);
  doc.addEventListener("mousedown", onDocMouseDown, true);
  win.addEventListener("scroll", hide, true);

  const cleanup = () => {
    doc.removeEventListener("mouseup", onMouseUp);
    doc.removeEventListener("mousedown", onDocMouseDown, true);
    win.removeEventListener("scroll", hide, true);
    pop.remove();
    (doc as any).__ieltsuzVocab = null;
  };

  (doc as any).__ieltsuzVocab = cleanup;
  return cleanup;
}
