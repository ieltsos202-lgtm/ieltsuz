// Shared types for the "New City" story RPG. Used by both the API routes and
// the client, so the contract between them is checked at compile time.

export type RpgLevel = 1 | 2 | 3 | 4 | 5;

// ---------------------------------------------------------------- content ----

export interface SceneObjective {
  id: string;
  title_uz: string;
  required: boolean;
  /**
   * The server only credits this objective when the player's own words contain
   * one of these. Without it the AI could hand out completions for free — see
   * lib/rpg/validate.ts.
   */
  requires_keywords_any: string[];
}

export interface TargetWord {
  word: string;
  uz: string;
}

export interface Scene {
  id: string;
  chapter: number;
  order: number;
  title_uz: string;
  intro_uz: string;
  /** Physical setting, injected into the NPC prompt. */
  setting: string;
  image: string;
  npc_id: string;
  max_turns: number;
  objectives: SceneObjective[];
  target_words: TargetWord[];
  /** Safe scripted lines used when the AI fails twice. */
  fallback_lines: string[];
  /** The NPC's very first line — scripted, so starting a scene costs no AI call. */
  opening_line: string;
  level5_complication: string;
}

export interface Npc {
  id: string;
  name: string;
  role_uz: string;
  personality: string;
  avatar: string;
  accent_color: string;
}

// ------------------------------------------------------------------ state ----

export type NpcEmotion =
  | "neutral"
  | "happy"
  | "surprised"
  | "confused"
  | "amused"
  | "concerned";

export interface TranscriptEntry {
  role: "npc" | "player";
  text: string;
  /** Uzbek translation of an NPC line (levels 1-2 show it). */
  uz?: string;
  emotion?: NpcEmotion;
}

export interface PlayerError {
  original: string;
  corrected: string;
  note_uz: string;
}

export interface SuggestedReply {
  text: string;
  quality: "good" | "ok" | "bad";
}

export interface SentenceBuilder {
  words: string[];
  correct: string;
}

/** How a target word was handled during the scene — drives spaced repetition. */
export type WordOutcome = "used_correctly" | "recognized" | "used_wrongly";

/**
 * The authoritative session state. Lives in rpg_sessions.state_json; the
 * browser receives a rendered view of it and can never write it directly.
 */
export interface SessionState {
  scene_id: string;
  npc_id: string;
  level: RpgLevel;
  hero_name: string;
  transcript: TranscriptEntry[];
  /** Objective ids the SERVER has confirmed. */
  completed_objectives: string[];
  /** Target words the NPC has actually introduced so far. */
  words_introduced: string[];
  /** word -> best outcome seen this scene. */
  word_outcomes: Record<string, WordOutcome>;
  errors: PlayerError[];
  /** Player turns that contained no detected mistake — feeds answer accuracy. */
  clean_answers: number;
  player_turns: number;
  /** Set when the AI output failed validation twice and a fallback was used. */
  ai_failures: number;
}

// -------------------------------------------------------- AI turn contract ----

/** Exactly what the model is allowed to return. Anything else is dropped. */
export interface AiTurn {
  npc_reply: string;
  npc_reply_uz: string;
  emotion: NpcEmotion;
  objectives_hit: string[];
  target_words_introduced: string[];
  target_words_used_by_player: string[];
  player_errors: PlayerError[];
  suggested_replies: SuggestedReply[];
  sentence_builder: SentenceBuilder | null;
  scene_should_end: boolean;
}

// ------------------------------------------------------- API view models ----

export interface ObjectiveView {
  id: string;
  title_uz: string;
  required: boolean;
  done: boolean;
}

export interface TurnResponse {
  npc_reply: string;
  /** Only sent when the player's level is allowed to see it. */
  npc_reply_uz: string | null;
  emotion: NpcEmotion;
  objectives: ObjectiveView[];
  /** Objective ids newly confirmed by this turn (for the checkmark animation). */
  newly_completed: string[];
  new_words: TargetWord[];
  suggested_replies: SuggestedReply[] | null;
  sentence_builder: SentenceBuilder | null;
  turn: number;
  max_turns: number;
  scene_over: boolean;
  /** True when this line came from the scripted fallback, not the model. */
  fallback: boolean;
}

export interface SceneListItem {
  id: string;
  order: number;
  title_uz: string;
  intro_uz: string;
  image: string;
  npc_name: string;
  npc_role_uz: string;
  locked: boolean;
  completed: boolean;
  best_score: number;
  attempts: number;
  recommended: boolean;
  /** How many of this scene's target words are due for review. */
  due_words: number;
}

export interface RpgProfileView {
  hero_name: string | null;
  level: RpgLevel;
  xp: number;
  streak: number;
  is_pro: boolean;
  words_learned: number;
  badges: string[];
  limits: {
    scenes_left: number | null;
    turns_left: number | null;
    max_level: RpgLevel;
  };
}

export interface FinishResponse {
  scene_score: number;
  xp_gained: number;
  total_xp: number;
  objectives: ObjectiveView[];
  new_words: (TargetWord & { stage: number; strength: number })[];
  errors: PlayerError[];
  streak: number;
  level: RpgLevel;
  level_changed: 0 | 1 | -1;
  level_message_uz: string | null;
  new_badges: string[];
  next_scene_id: string | null;
}

export interface WordCard {
  word: string;
  uz: string | null;
  stage: number;
  /** Decay already applied — this is what the bar should show. */
  strength: number;
  due: boolean;
  seen_count: number;
  lapses: number;
}
