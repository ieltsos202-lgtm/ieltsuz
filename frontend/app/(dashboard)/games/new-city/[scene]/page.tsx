"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowLeft, Crown, Flag, Languages, MapPin, Play } from "lucide-react";

import { apiGet, apiPost } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { LoadingSpinner } from "@/components/shared/LoadingSpinner";
import { ChatStream } from "@/components/rpg/ChatStream";
import { LevelInput } from "@/components/rpg/LevelInput";
import { NpcAvatar } from "@/components/rpg/NpcAvatar";
import { ObjectiveTracker } from "@/components/rpg/ObjectiveTracker";
import { SceneResult } from "@/components/rpg/SceneResult";
import type {
  FinishResponse,
  ObjectiveView,
  SceneListItem,
  SentenceBuilder,
  SuggestedReply,
  TranscriptEntry,
  TurnResponse,
} from "@/lib/rpg/types";

function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

interface StartResponse {
  session_id: string;
  resumed: boolean;
  level: 1 | 2 | 3 | 4 | 5;
  input_mode: "choices" | "tiles" | "text" | "voice";
  show_translation: boolean;
  scene: { id: string; title_uz: string; intro_uz: string; image: string };
  objectives: ObjectiveView[];
  transcript: TranscriptEntry[];
  turn: number;
  max_turns: number;
  npc: { id: string; name: string; role_uz: string; avatar: string };
}

type Phase = "intro" | "playing" | "result";

export default function RpgScenePage() {
  const params = useParams();
  const sceneId = String(params?.scene || "");

  const [meta, setMeta] = useState<SceneListItem | null>(null);
  const [phase, setPhase] = useState<Phase>("intro");
  const [starting, setStarting] = useState(false);
  const [session, setSession] = useState<StartResponse | null>(null);
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [objectives, setObjectives] = useState<ObjectiveView[]>([]);
  const [justCompleted, setJustCompleted] = useState<string[]>([]);
  const [suggestions, setSuggestions] = useState<SuggestedReply[] | null>(null);
  const [builder, setBuilder] = useState<SentenceBuilder | null>(null);
  const [hint, setHint] = useState<{ hint: string; starter: string } | null>(null);
  const [turn, setTurn] = useState(0);
  const [sceneOver, setSceneOver] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [result, setResult] = useState<FinishResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [upgrade, setUpgrade] = useState(false);
  const [showUz, setShowUz] = useState(true);

  // Guards against state updates after the player navigates away mid-request.
  const aliveRef = useRef(true);
  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  // The intro screen shows the scene's Uzbek copy before any session exists.
  // It comes from the same endpoint the map uses, so the JSON files stay the
  // single source of truth and the objective keywords never reach the browser.
  useEffect(() => {
    void (async () => {
      try {
        const res = await apiGet<{ scenes: SceneListItem[] }>("/api/rpg/scenes");
        if (!aliveRef.current) return;
        setMeta(res.scenes.find((s) => s.id === sceneId) || null);
      } catch {
        /* the Boshlash button still works; only the description is missing */
      }
    })();
  }, [sceneId]);

  const start = async () => {
    setStarting(true);
    setError(null);
    setUpgrade(false);
    try {
      const res = await apiPost<StartResponse>("/api/rpg/session/start", {
        scene_id: sceneId,
        day: today(),
      });
      if (!aliveRef.current) return;
      setSession(res);
      setTranscript(res.transcript);
      setObjectives(res.objectives);
      setTurn(res.turn);
      setShowUz(res.show_translation);
      setPhase("playing");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Sahnani boshlab bo'lmadi";
      // The API returns a friendly Uzbek message plus an upgrade hint for limits.
      setUpgrade(/pro|limit/i.test(msg));
      setError(msg);
    } finally {
      if (aliveRef.current) setStarting(false);
    }
  };

  const send = useCallback(
    async (message: string, tiles?: string[]) => {
      if (!session || thinking || sceneOver) return;

      // Show the player's line immediately — waiting for the server to echo it
      // makes the conversation feel laggy.
      setTranscript((t) => [...t, { role: "player", text: message }]);
      setThinking(true);
      setSuggestions(null);
      setBuilder(null);
      setHint(null);
      setError(null);

      try {
        const res = await apiPost<TurnResponse>("/api/rpg/session/turn", {
          session_id: session.session_id,
          message,
          tiles,
          day: today(),
        });
        if (!aliveRef.current) return;

        setTranscript((t) => [
          ...t,
          {
            role: "npc",
            text: res.npc_reply,
            uz: res.npc_reply_uz || undefined,
            emotion: res.emotion,
          },
        ]);
        setObjectives(res.objectives);
        setJustCompleted(res.newly_completed);
        setSuggestions(res.suggested_replies);
        setBuilder(res.sentence_builder);
        setTurn(res.turn);
        setSceneOver(res.scene_over);
      } catch (e) {
        if (!aliveRef.current) return;
        const msg = e instanceof Error ? e.message : "Javob olinmadi";
        setUpgrade(/pro|limit/i.test(msg));
        setError(msg);
        // Roll the optimistic bubble back so the transcript matches the server.
        setTranscript((t) => t.slice(0, -1));
      } finally {
        if (aliveRef.current) setThinking(false);
      }
    },
    [session, thinking, sceneOver]
  );

  const askHint = async () => {
    if (!session) return;
    try {
      const res = await apiPost<{ hint: string; starter: string }>("/api/rpg/session/hint", {
        session_id: session.session_id,
      });
      if (aliveRef.current) setHint(res);
    } catch {
      /* a failed hint is not worth interrupting the scene for */
    }
  };

  const finish = async () => {
    if (!session) return;
    setThinking(true);
    try {
      const res = await apiPost<FinishResponse>("/api/rpg/session/finish", {
        session_id: session.session_id,
        day: today(),
      });
      if (!aliveRef.current) return;
      setResult(res);
      setPhase("result");
    } catch (e) {
      if (aliveRef.current) setError(e instanceof Error ? e.message : "Natijani olib bo'lmadi");
    } finally {
      if (aliveRef.current) setThinking(false);
    }
  };

  // ------------------------------------------------------------------ views ----

  if (phase === "result" && result) return <SceneResult result={result} />;

  if (phase === "intro") {
    return (
      <div className="mx-auto max-w-lg space-y-4 py-4">
        <Link
          href="/games/new-city"
          className="inline-flex items-center gap-1 text-sm text-content-secondary hover:text-content-primary"
        >
          <ArrowLeft className="h-4 w-4" /> Xarita
        </Link>

        <Card className="space-y-4">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-content-secondary">
            <MapPin className="h-4 w-4 text-accent" /> New City · 1-bob
          </div>

          <h1 className="text-2xl font-extrabold">{meta?.title_uz || "Sahna"}</h1>
          {meta && (
            <p className="text-xs text-content-secondary">
              {meta.npc_name} — {meta.npc_role_uz}
            </p>
          )}
          <p className="text-sm leading-relaxed text-content-secondary">
            {meta?.intro_uz || "Sahnani boshlash uchun tugmani bosing."}
          </p>

          {error && (
            <div className="rounded-[var(--radius)] border border-accent-red/40 bg-accent-red/10 p-3 text-sm">
              <p>{error}</p>
              {upgrade && (
                <Link href="/upgrade">
                  <Button variant="gradient" size="sm" className="mt-2">
                    <Crown className="h-4 w-4" /> Pro olish
                  </Button>
                </Link>
              )}
            </div>
          )}

          <Button variant="gradient" className="w-full" disabled={starting} onClick={start}>
            {starting ? "Yuklanmoqda..." : <><Play className="h-4 w-4" /> Boshlash</>}
          </Button>
        </Card>
      </div>
    );
  }

  if (!session) return <LoadingSpinner />;

  const requiredLeft = objectives.filter((o) => o.required && !o.done).length;

  return (
    <div className="mx-auto flex h-[calc(100vh-7rem)] max-w-2xl flex-col">
      {/* NPC header */}
      <div className="flex items-center gap-3 border-b border-border pb-3">
        <Link href="/games/new-city" aria-label="Xarita">
          <ArrowLeft className="h-5 w-5 text-content-secondary hover:text-content-primary" />
        </Link>
        <NpcAvatar avatar={session.npc.avatar} emotion={lastEmotion(transcript)} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold">{session.npc.name}</p>
          <p className="truncate text-[11px] text-content-secondary">{session.npc.role_uz}</p>
        </div>
        {session.show_translation && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowUz((v) => !v)}
            title="Tarjimani ko'rsatish/yashirish"
          >
            <Languages className={cn("h-4 w-4", showUz ? "text-accent" : "")} />
          </Button>
        )}
      </div>

      <div className="py-2">
        <ObjectiveTracker
          objectives={objectives}
          justCompleted={justCompleted}
          turn={turn}
          maxTurns={session.max_turns}
        />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <ChatStream
          transcript={transcript}
          npcName={session.npc.name}
          npcAvatar={session.npc.avatar}
          thinking={thinking}
          showTranslation={showUz}
        />
      </div>

      {error && (
        <div className="mb-2 rounded-[var(--radius)] border border-accent-red/40 bg-accent-red/10 p-2.5 text-xs">
          <p>{error}</p>
          {upgrade && (
            <Link href="/upgrade" className="mt-1 inline-block font-semibold text-accent underline">
              Pro olish
            </Link>
          )}
        </div>
      )}

      <div className="border-t border-border pt-3">
        {sceneOver ? (
          <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="space-y-2">
            <p className="text-center text-xs text-content-secondary">
              {requiredLeft === 0
                ? "Sahna tugadi — natijani ko'ring."
                : "Navbatlar tugadi — natijani ko'ring."}
            </p>
            <Button variant="gradient" className="w-full" disabled={thinking} onClick={finish}>
              <Flag className="h-4 w-4" /> Natijani ko&apos;rish
            </Button>
          </motion.div>
        ) : (
          <>
            <LevelInput
              mode={session.input_mode}
              disabled={thinking}
              suggestions={suggestions}
              builder={builder}
              hint={hint}
              onSend={send}
              onHint={askHint}
              onDismissHint={() => setHint(null)}
            />
            {requiredLeft === 0 && (
              <button
                onClick={finish}
                disabled={thinking}
                className="mt-2 w-full text-center text-xs text-accent underline"
              >
                Suhbatni hozir yakunlash
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function lastEmotion(transcript: TranscriptEntry[]) {
  for (let i = transcript.length - 1; i >= 0; i--) {
    if (transcript[i].role === "npc" && transcript[i].emotion) return transcript[i].emotion;
  }
  return "neutral" as const;
}
