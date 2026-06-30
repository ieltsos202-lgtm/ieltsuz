"use client";

import { useEffect, useRef, useState } from "react";
import { Send, Loader2, GraduationCap, Trash2, Sparkles } from "lucide-react";

import { apiGet, apiPost, apiDelete } from "@/lib/api";
import { Button } from "@/components/ui/button";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

const SUGGESTIONS = [
  "How can I improve my Writing Task 2 band score?",
  "What is my weakest skill and how do I fix it?",
  "How do I improve speaking fluency?",
  "Create a weekly study plan to reach my target band",
];

export function CoachChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    apiGet<{ messages: ChatMessage[] }>("/api/coach/chat")
      .then((res) => setMessages(res.messages || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, sending]);

  const send = async (text: string) => {
    const msg = text.trim();
    if (!msg || sending) return;
    setError(null);
    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: msg }]);
    setSending(true);
    try {
      const res = await apiPost<{ reply: string }>("/api/coach/chat", { message: msg });
      setMessages((prev) => [...prev, { role: "assistant", content: res.reply }]);
    } catch (e: any) {
      setError(e.message || "Something went wrong");
    } finally {
      setSending(false);
    }
  };

  const clearChat = async () => {
    try {
      await apiDelete("/api/coach/chat");
      setMessages([]);
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="flex h-[70vh] flex-col rounded-[var(--radius-lg)] border border-border bg-bg-secondary">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <GraduationCap className="h-5 w-5 text-accent" />
          <span className="font-semibold">Chat with AI Coach</span>
        </div>
        {messages.length > 0 && (
          <button
            onClick={clearChat}
            className="flex items-center gap-1 text-xs text-content-secondary transition-colors hover:text-red-400"
          >
            <Trash2 className="h-3.5 w-3.5" /> Clear
          </button>
        )}
      </div>

      <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto p-4">
        {loading ? (
          <div className="flex h-full items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-accent" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-accent/15">
              <Sparkles className="h-7 w-7 text-accent" />
            </div>
            <div>
              <p className="font-medium">Ask your coach anything</p>
              <p className="mt-1 text-sm text-content-secondary">
                Grammar, strategy, mistakes, or your target band — all in one place.
              </p>
            </div>
            <div className="flex max-w-md flex-wrap justify-center gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  className="rounded-full border border-border px-3 py-1.5 text-xs text-content-secondary transition-colors hover:border-accent hover:text-accent"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((m, i) => (
            <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm ${
                  m.role === "user"
                    ? "bg-accent text-white"
                    : "border border-border bg-bg-tertiary text-content-primary"
                }`}
              >
                {m.content}
              </div>
            </div>
          ))
        )}

        {sending && (
          <div className="flex justify-start">
            <div className="flex items-center gap-2 rounded-2xl border border-border bg-bg-tertiary px-4 py-2.5 text-sm text-content-secondary">
              <Loader2 className="h-4 w-4 animate-spin" /> Coach is typing…
            </div>
          </div>
        )}
      </div>

      {error && <p className="px-4 pb-1 text-xs text-red-400">{error}</p>}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
        className="flex items-end gap-2 border-t border-border p-3"
      >
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send(input);
            }
          }}
          placeholder="Type your question… (Enter to send)"
          rows={1}
          className="max-h-32 flex-1 resize-none rounded-[var(--radius)] border border-border bg-bg-tertiary px-3 py-2.5 text-sm text-content-primary outline-none focus:border-accent"
        />
        <Button type="submit" size="icon" disabled={sending || !input.trim()}>
          {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </Button>
      </form>
    </div>
  );
}
