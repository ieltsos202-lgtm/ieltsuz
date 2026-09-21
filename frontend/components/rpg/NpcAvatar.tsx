"use client";

import { motion } from "framer-motion";
import {
  ShieldCheck,
  ConciergeBell,
  Coffee,
  ShoppingBasket,
  Dog,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";
import type { NpcEmotion } from "@/lib/rpg/types";

/**
 * Character portrait. There is no artwork yet, so each NPC gets a distinct
 * icon + gradient — recognisable, zero assets to load, and it degrades
 * gracefully if a scene names an avatar we do not know.
 */
const AVATARS: Record<string, { icon: LucideIcon; gradient: string }> = {
  officer: { icon: ShieldCheck, gradient: "from-accent to-accent-purple" },
  receptionist: { icon: ConciergeBell, gradient: "from-accent-purple to-accent-red" },
  barista: { icon: Coffee, gradient: "from-accent-yellow to-accent-red" },
  shopkeeper: { icon: ShoppingBasket, gradient: "from-accent-green to-accent" },
  friend: { icon: Dog, gradient: "from-accent-red to-accent-yellow" },
};

/** A ring colour per emotion, so the mood is visible without any artwork. */
const EMOTION_RING: Record<NpcEmotion, string> = {
  neutral: "ring-border",
  happy: "ring-accent-green/70",
  amused: "ring-accent-yellow/70",
  surprised: "ring-accent-purple/70",
  confused: "ring-accent-yellow/60",
  concerned: "ring-accent-red/60",
};

export function NpcAvatar({
  avatar,
  emotion = "neutral",
  size = "md",
}: {
  avatar: string;
  emotion?: NpcEmotion;
  size?: "sm" | "md" | "lg";
}) {
  const def = AVATARS[avatar] || AVATARS.friend;
  const Icon = def.icon;

  const box = size === "sm" ? "h-8 w-8" : size === "lg" ? "h-16 w-16" : "h-11 w-11";
  const glyph = size === "sm" ? "h-4 w-4" : size === "lg" ? "h-8 w-8" : "h-5 w-5";

  return (
    <motion.div
      // A small pop whenever the emotion changes gives the character some life.
      key={emotion}
      initial={{ scale: 0.92 }}
      animate={{ scale: 1 }}
      transition={{ type: "spring", stiffness: 300, damping: 18 }}
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br text-white ring-2",
        def.gradient,
        EMOTION_RING[emotion] ?? EMOTION_RING.neutral,
        box
      )}
    >
      <Icon className={glyph} />
    </motion.div>
  );
}
