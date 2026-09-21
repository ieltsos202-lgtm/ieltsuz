// The games registry. Adding a new game = one entry here; the /games hub and
// any future "recommended game" surfaces read this list, so nothing else needs
// to change.

import type { LucideIcon } from "lucide-react";
import { MapPin } from "lucide-react";

export interface GameEntry {
  id: string;
  title: string;
  /** One-line Uzbek description shown on the hub card. */
  description_uz: string;
  href: string;
  icon: LucideIcon;
  /** Tailwind gradient classes for the card's icon tile. */
  gradient: string;
  /** Games that are listed but not playable yet. */
  coming_soon?: boolean;
}

export const GAMES: GameEntry[] = [
  {
    id: "new-city",
    title: "New City",
    description_uz:
      "Hikoyali o'yin: Londonda haqiqiy odamlar bilan inglizcha gaplashib, kundalik vaziyatlarni yeching.",
    href: "/games/new-city",
    icon: MapPin,
    gradient: "from-accent to-accent-purple",
  },
];
