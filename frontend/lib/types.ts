export type Skill = "listening" | "reading" | "writing" | "speaking";

export interface Profile {
  id: string;
  full_name: string;
  email: string;
  target_band: number;
  exam_date: string | null;
  avatar_url: string | null;
  phone: string | null;
  current_level: string | null;  // A1, A2, B1, B2, C1, C2
  onboarding_completed: boolean;
  is_admin?: boolean;
  is_pro?: boolean;
  pro_expires_at?: string | null;
  trial_listening_remaining?: number;
  trial_reading_remaining?: number;
  trial_speaking_remaining?: number;
  trial_writing_remaining?: number;
  trial_mock_remaining?: number;
  bonus_mock_remaining?: number;
  promo_code?: string;
  referred_by?: string | null;
  ielts_experience?: string | null;
  listening_band?: number | null;
  reading_band?: number | null;
  writing_band?: number | null;
  speaking_band?: number | null;
  created_at: string;
  updated_at: string;
}

export interface StudyPlan {
  current_level: string;
  current_band_estimate: number;
  target_band: number;
  band_gap: number;
  estimated_days: number;
  mocks_per_week: number;
  daily_study_hours: number;
  estimated_readiness_date: string;
  message: string;
  focus_skills: string[];
}

export interface CambridgeTest {
  id: string;
  book_number: number;
  test_number: number;
  test_name: string;
  listening_pdf_path: string | null;
  reading_pdf_path: string | null;
  writing_pdf_path: string | null;
  audio_section1_path: string | null;
  audio_section2_path: string | null;
  audio_section3_path: string | null;
  audio_section4_path: string | null;
}

export interface SkillStat {
  current: number | null;
  attempts: number;
}

export interface DashboardOverview {
  stats: Record<Skill, SkillStat>;
  recent_activity: {
    skill: Skill;
    band_score: number | null;
    created_at: string | null;
  }[];
}

// ---------- Writing ----------
export interface SentenceCorrection {
  original: string;
  corrected: string;
  explanation: string;
}

export interface VocabularyWord {
  word: string;
  definition: string;
  example: string;
}

export interface CriterionFeedback {
  task_achievement?: string;
  coherence_cohesion?: string;
  lexical_resource?: string;
  grammatical_range?: string;
}

export interface WritingFeedback {
  band_score: number;
  task_achievement: number;
  coherence_cohesion: number;
  lexical_resource: number;
  grammatical_range: number;
  strengths: string[];
  improvements: string[];
  sentence_corrections: SentenceCorrection[];
  model_answer: string;
  criterion_feedback?: CriterionFeedback;
  new_vocabulary: VocabularyWord[];
}

// ---------- Speaking ----------
export interface GrammarError {
  error: string;
  correction: string;
  explanation: string;
}

export interface VocabularySuggestion {
  used: string;
  better_alternative: string;
  why: string;
}

export interface SpeakingFeedback {
  band_score: number;
  fluency_coherence: number;
  lexical_resource: number;
  grammatical_range: number;
  pronunciation: number;
  what_user_said_analysis: string;
  what_should_have_said: string;
  model_answer: string;
  grammar_errors: GrammarError[];
  vocabulary_suggestions: VocabularySuggestion[];
  pronunciation_tips: string[];
  fluency_tips?: string[];
  feedback: string;
}

export interface SpeakingQuestion {
  question: string;
  model_answer?: string;
}

export interface SpeakingQuestionSet {
  part: number;
  topic: string;
  questions: (string | SpeakingQuestion)[];
  bullets?: string[];  // Part 2 cue card bullets
  model_answer?: string;  // Part 2 model answer
  part3_questions?: string[];  // Part 3 questions tied to the Part 2 cue card
}

// ---------- Listening / Reading ----------
export interface ParsedQuestion {
  number: number;
  type: "multiple_choice" | "gap_filling";
  question?: string;
  context?: string;
  placeholder?: string;
  options?: Record<string, string>;
}

// Structured, interactive questions parsed from the PDF by Claude.
export type QuestionType =
  | "gap_filling"
  | "multiple_choice"
  | "matching"
  | "matching_headings"
  | "matching_information"
  | "true_false_not_given"
  | "yes_no_notgiven"
  | "map_labelling"
  | "form_completion"
  | "table_completion";

export interface GroupQuestion {
  number: number;
  type: QuestionType | string;
  // gap_filling
  before_gap?: string;
  after_gap?: string;
  answer_format?: string;
  // multiple_choice
  question?: string;
  options?: Record<string, string>;
  // matching
  item?: string;
  // true_false_not_given / matching_information
  statement?: string;
  // matching_headings
  paragraph?: string;
  correct_answer?: string;
}

export interface QuestionGroup {
  group_type: QuestionType | string;
  group_instructions?: string;
  title?: string;
  question_range?: string;
  match_options?: Record<string, string>;
  items_to_match?: string[];
  headings_list?: string[];
  summary_text?: string;
  questions: GroupQuestion[];
}

export interface ListeningQuestions {
  section: number;
  start_question: number;
  end_question: number;
  instructions?: string;
  question_groups?: QuestionGroup[];
  questions: ParsedQuestion[];
  total?: number;
  total_questions?: number;
  found: boolean;
  has_answer_key?: boolean;
  is_scanned?: boolean;
  message?: string;
  raw_text?: string;
}

export interface ReadingPassage {
  passage_number: number;
  passage_title?: string;
  passage_text: string;
  paragraphs?: Record<string, string>;
  question_groups?: QuestionGroup[];
  questions: ParsedQuestion[];
  found: boolean;
  is_scanned?: boolean;
  message?: string;
}

export interface WrongAnalysisItem {
  question_number: number;
  user_answer?: string;
  correct_answer?: string;
  audio_timestamp?: string;
  paragraph_reference?: string;
  exact_text_clue?: string;
  why_wrong?: string;
  explanation?: string;
  tip?: string;
  question_type_tip?: string;
}

export interface ListeningFeedback {
  band_score: number;
  correct_count: number;
  total: number;
  wrong_analysis: WrongAnalysisItem[];
  weak_areas: string[];
  feedback: string;
  improvement_tips: string[];
}

export interface ReadingFeedback {
  band_score: number;
  correct_count: number;
  total: number;
  wrong_analysis: WrongAnalysisItem[];
  vocabulary_from_highlights: (VocabularyWord & { ielts_relevance?: string })[];
  strategy_tips: string[];
  feedback: string;
  weak_question_types: string[];
}

// ---------- Word Games (shared master pool, built from the real test bank) ----------
export interface GameMasterItem {
  id: string;
  word: string;
  type: "word" | "idiom";
  translation: string | null;
  phonetic: string | null;
  definition: string | null;
  examples: string[];
  difficulty: string;
  source: string | null;
}

export interface GameMasterSentence {
  id: string;
  sentence: string;
  translation: string | null;
  structure_note: string | null;
  difficulty: string;
  source: string | null;
}

export interface PerGameStats {
  plays?: number;
  best_score?: number;
  best_streak?: number;
}

export interface GameStats {
  xp: number;
  games_played: number;
  best_combo: number;
  level: number;
  xp_into_level: number;
  xp_needed: number;
  percent: number;
  game_stats?: Record<string, PerGameStats>;
}

export interface GameFinishResult {
  xp_gained: number;
  leveled_up: boolean;
  /** Level before this session's XP was added — for tier-transition detection. */
  prev_level?: number;
  stats: GameStats;
}

// ---------- Vocabulary ----------
export interface VocabRecord {
  id: string;
  word: string;
  definition: string | null;
  translation: string | null;
  phonetic: string | null;
  example: string | null;
  examples: string[] | null;
  source: string | null;
  mastered: boolean;
  review_count: number;
  next_review: string | null;
}

export interface VocabStats {
  total: number;
  mastered: number;
  due: number;
}

// ---------- Progress ----------
export interface ProgressPoint {
  date: string;
  band: number;
}

export interface BestResult {
  band: number;
  test_source: string | null;
  date: string;
}

export interface ProgressHistory {
  series: Record<Skill, ProgressPoint[]>;
  best: Record<Skill, BestResult | null>;
  activity: Record<string, number>;
}

export interface StudyRecommendation {
  recommendation: string;
  study_plan: Record<string, number>;
}

// ---------- AI Teacher / Coaching ----------
export interface CoachSkillHistoryPoint {
  date: string;
  band: number;
}

export interface CoachSkillAnalysis {
  skill: Skill;
  current: number | null;
  target: number;
  gap: number;
  status: "on_track" | "close" | "needs_work" | "no_data";
  summary: string;
  weaknesses: string[];
  strengths: string[];
  actions: string[];
  trend?: number | null;
  history?: CoachSkillHistoryPoint[];
}

export interface CoachWeeklyFocus {
  focus: string;
  tasks: string[];
}

export interface CoachSkillDelta {
  skill: Skill;
  previous: number | null;
  current: number | null;
  delta: number | null;
}

export interface CoachSinceLastCheck {
  previous_generated_at: string;
  overall_delta: number | null;
  skill_deltas: CoachSkillDelta[];
}

export interface CoachAnalysis {
  generated_at: string;
  headline: string;
  motivation: string;
  progress_update?: string | null;
  since_last_check?: CoachSinceLastCheck | null;
  streak_days?: number;
  current_overall: number | null;
  target_band: number;
  overall_gap: number;
  readiness_percent: number;
  exam_date: string | null;
  days_to_exam: number | null;
  priorities: string[];
  skills: CoachSkillAnalysis[];
  weekly_plan: CoachWeeklyFocus[];
  strategy: string[];
}

export interface CoachAnalysisResponse {
  analysis: CoachAnalysis | null;
  cached: boolean;
  has_data: boolean;
  message?: string;
}
