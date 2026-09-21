// Loads the scene + NPC content and validates it ONCE at module load.
//
// Scenes are data, not code, so a typo in a JSON file must fail loudly and
// immediately rather than surface as a broken game three screens later. The
// checks below run when this module is first imported — i.e. at build time for
// the route handlers that import it.

import airportPassport from "@/data/rpg/scenes/airport_passport.json";
import hotelCheckin from "@/data/rpg/scenes/hotel_checkin.json";
import cafeOrder from "@/data/rpg/scenes/cafe_order.json";
import cornerShop from "@/data/rpg/scenes/corner_shop.json";
import newFriend from "@/data/rpg/scenes/new_friend.json";
import npcData from "@/data/rpg/npcs.json";

import type { Npc, Scene } from "./types";

const RAW_SCENES = [airportPassport, hotelCheckin, cafeOrder, cornerShop, newFriend];

function fail(sceneId: string, problem: string): never {
  throw new Error(`Invalid RPG scene "${sceneId}": ${problem}`);
}

function str(value: unknown): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

/** Schema check. Throws on the first problem with a message naming the scene. */
function validateScene(raw: any, npcs: Record<string, Npc>): Scene {
  const id = typeof raw?.id === "string" ? raw.id : "(missing id)";

  if (!str(raw.id)) fail(id, "id is required");
  for (const field of ["title_uz", "intro_uz", "setting", "image", "npc_id", "opening_line"]) {
    if (!str(raw[field])) fail(id, `${field} is required`);
  }
  if (!Number.isInteger(raw.chapter) || raw.chapter < 1) fail(id, "chapter must be a positive integer");
  if (!Number.isInteger(raw.order) || raw.order < 1) fail(id, "order must be a positive integer");
  if (!Number.isInteger(raw.max_turns) || raw.max_turns < 4 || raw.max_turns > 40) {
    fail(id, "max_turns must be an integer between 4 and 40");
  }
  if (!npcs[raw.npc_id]) fail(id, `npc_id "${raw.npc_id}" is not defined in npcs.json`);

  if (!Array.isArray(raw.objectives) || raw.objectives.length === 0) {
    fail(id, "objectives must be a non-empty array");
  }
  const objectiveIds = new Set<string>();
  for (const o of raw.objectives) {
    if (!str(o?.id)) fail(id, "every objective needs an id");
    if (objectiveIds.has(o.id)) fail(id, `duplicate objective id "${o.id}"`);
    objectiveIds.add(o.id);
    if (!str(o.title_uz)) fail(id, `objective "${o.id}" needs title_uz`);
    if (typeof o.required !== "boolean") fail(id, `objective "${o.id}" needs a boolean "required"`);
    if (!Array.isArray(o.requires_keywords_any) || o.requires_keywords_any.length === 0) {
      // Without keywords the server has no way to verify the objective, which
      // would mean trusting the model — the one thing we never do.
      fail(id, `objective "${o.id}" needs a non-empty requires_keywords_any`);
    }
    if (!o.requires_keywords_any.every(str)) {
      fail(id, `objective "${o.id}" has an empty keyword`);
    }
  }
  if (!raw.objectives.some((o: any) => o.required)) {
    fail(id, "at least one objective must be required, otherwise the scene can never be completed");
  }

  if (!Array.isArray(raw.target_words) || raw.target_words.length < 4) {
    fail(id, "target_words must have at least 4 entries");
  }
  const words = new Set<string>();
  for (const w of raw.target_words) {
    if (!str(w?.word) || !str(w?.uz)) fail(id, "every target word needs both word and uz");
    const key = w.word.toLowerCase();
    if (words.has(key)) fail(id, `duplicate target word "${w.word}"`);
    words.add(key);
  }

  if (!Array.isArray(raw.fallback_lines) || raw.fallback_lines.length === 0 || !raw.fallback_lines.every(str)) {
    fail(id, "fallback_lines must be a non-empty array of strings");
  }
  if (!str(raw.level5_complication)) fail(id, "level5_complication is required");

  return raw as Scene;
}

const NPCS: Record<string, Npc> = npcData as Record<string, Npc>;

for (const [key, npc] of Object.entries(NPCS)) {
  if (npc.id !== key) throw new Error(`NPC "${key}" has mismatched id "${npc.id}"`);
  if (!str(npc.name) || !str(npc.personality) || !str(npc.role_uz)) {
    throw new Error(`NPC "${key}" is missing name, role_uz or personality`);
  }
}

const SCENES: Scene[] = RAW_SCENES.map((raw) => validateScene(raw, NPCS)).sort(
  (a, b) => a.chapter - b.chapter || a.order - b.order
);

const byId = new Map(SCENES.map((s) => [s.id, s]));
if (byId.size !== SCENES.length) throw new Error("Duplicate RPG scene id");

/** Every scene, chapter then order. */
export function allScenes(): Scene[] {
  return SCENES;
}

export function getScene(id: string): Scene | null {
  return byId.get(id) ?? null;
}

export function getNpc(id: string): Npc | null {
  return NPCS[id] ?? null;
}

/** The scene the player should do after this one, or null at the end. */
export function nextSceneId(id: string): string | null {
  const i = SCENES.findIndex((s) => s.id === id);
  return i >= 0 && i + 1 < SCENES.length ? SCENES[i + 1].id : null;
}

/** Scene ids that must be completed before `id` unlocks (just the previous one). */
export function prerequisiteOf(id: string): string | null {
  const i = SCENES.findIndex((s) => s.id === id);
  return i > 0 ? SCENES[i - 1].id : null;
}
