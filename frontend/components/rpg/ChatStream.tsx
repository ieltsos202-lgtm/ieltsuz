"use client";

import { useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { User } from "lucide-react";

import { cn } from "@/lib/utils";
import type { TranscriptEntry } from "@/lib/rpg/types";
import { NpcAvatar } from "./NpcAvatar";

/**
 * The conversation itself. NPC lines on the left with an avatar whose face
 * follows the emotion the model reported; player lines on the right.
 *
 * The Uzbek translation is rendered only when the server sent one — levels 3+
 * get `uz: undefined` and must read the English.
 */
export function ChatStream({
  transcript,
  npcName,
  npcAvatar,
  thinking,
  showTranslation,
}: {
  transcript: TranscriptEntry[];
  npcName: string;
  npcAvatar: string;
  thinking: boolean;
  showTranslation: boolean;
}) {
  const endRef = useRef<HTMLDivElement>(null);

  // Keep the newest line in view, including while the NPC is "typing".
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [transcript.length, thinking]);

  return (
    <div className="flex flex-col gap-4 py-4">
      {transcript.map((entry, i) => {
        const isNpc = entry.role === "npc";
        return (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
            className={cn("flex items-end gap-2", isNpc ? "justify-start" : "justify-end")}
          >
            {isNpc && <NpcAvatar avatar={npcAvatar} emotion={entry.emotion} size="sm" />}

            <div
              className={cn(
                "max-w-[78%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed sm:max-w-[70%]",
                isNpc
                  ? "rounded-bl-sm bg-bg-tertiary text-content-primary"
                  : "rounded-br-sm bg-accent text-white"
              )}
            >
              {isNpc && (
                <p className="mb-0.5 text-[11px] font-semibold uppercase tracking-wide text-content-secondary">
                  {npcName}
                </p>
              )}
              <p>{entry.text}</p>
              {isNpc && showTranslation && entry.uz && (
                <p className="mt-1.5 border-t border-border pt-1.5 text-xs italic text-content-secondary">
                  {entry.uz}
                </p>
              )}
            </div>

            {!isNpc && (
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-bg-tertiary">
                <User className="h-4 w-4 text-content-secondary" />
              </div>
            )}
          </motion.div>
        );
      })}

      {thinking && (
        <div className="flex items-end gap-2">
          <NpcAvatar avatar={npcAvatar} emotion="neutral" size="sm" />
          <div className="rounded-2xl rounded-bl-sm bg-bg-tertiary px-4 py-3">
            <div className="flex gap-1">
              {[0, 1, 2].map((i) => (
                <motion.span
                  key={i}
                  className="h-1.5 w-1.5 rounded-full bg-content-secondary"
                  animate={{ opacity: [0.3, 1, 0.3] }}
                  transition={{ duration: 1.1, repeat: Infinity, delay: i * 0.18 }}
                />
              ))}
            </div>
          </div>
        </div>
      )}

      <div ref={endRef} />
    </div>
  );
}
