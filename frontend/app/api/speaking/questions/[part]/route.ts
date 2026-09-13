import { NextRequest, NextResponse } from "next/server";
import { generateJSON } from "@/lib/gemini";
import speakingQuestions from "@/data/speaking_questions.json";

// Generate fresh, exam-realistic questions with Gemini when the local bank
// is too small (acts as our "latest questions from the web" source).
async function generateQuestions(part: number, count: number): Promise<string[]> {
  try {
    const descriptor =
      part === 1
        ? "IELTS Speaking Part 1 questions (short, personal questions about familiar topics like home, work, hobbies, daily life)"
        : part === 3
        ? "IELTS Speaking Part 3 questions (abstract, opinion-based discussion questions exploring society, technology, education, culture)"
        : "IELTS Speaking questions";

    const prompt = `Generate ${count} recent, realistic ${descriptor}.
Use the style of the most recent IELTS exams. Each must be a single, self-contained question.
Return ONLY valid JSON: {"questions": ["question 1", "question 2", ...]}`;

    const data = await generateJSON(prompt);
    const qs = Array.isArray(data?.questions) ? data.questions : [];
    return qs.filter((q: unknown): q is string => typeof q === "string" && q.trim().length > 0);
  } catch {
    return [];
  }
}

async function generateCueCard(): Promise<{ question: string; bullets: string[] }> {
  try {
    const prompt = `Generate a recent, realistic IELTS Speaking Part 2 cue card.
Return ONLY valid JSON:
{"question": "Describe ...", "bullets": ["You should say:", "point 1", "point 2", "point 3", "and explain ..."]}`;
    const data = await generateJSON(prompt);
    if (typeof data?.question === "string" && data.question.trim()) {
      return {
        question: data.question,
        bullets: Array.isArray(data.bullets) ? data.bullets : [],
      };
    }
  } catch {
    /* fall through */
  }
  return {
    question: "Describe a person who has influenced your life.",
    bullets: ["You should say:", "who this person is", "how you know them", "what they did", "and explain why they influenced you"],
  };
}

// The data file stores each cue card's category + question concatenated
// together, e.g. "PART 2 — EXPERIENCEDescribe a movie you watched...".
// Every real question starts with "Describe", so split on that.
function extractCueQuestion(raw: string): string {
  const idx = raw.indexOf("Describe");
  return idx >= 0 ? raw.slice(idx).trim() : raw.trim();
}

function shuffle<T>(arr: T[]): T[] {
  return [...arr].sort(() => 0.5 - Math.random());
}

export async function GET(
  _req: NextRequest,
  { params }: { params: { part: string } }
) {
  try {
    const part = parseInt(params.part);
    const data = speakingQuestions as Record<string, any>;

    if (part === 1) {
      // Real IELTS Part 1 asks 3 questions on one topic, then 3 on a second
      // related topic — never a random mix of six unrelated topics.
      const PER_TOPIC = 3;
      const topics = (data.part1 || []).filter(
        (t: any) => (t.questions || []).length >= PER_TOPIC
      );

      let questions: string[] = [];
      if (topics.length >= 2) {
        const chosenTopics: any[] = shuffle(topics).slice(0, 2);
        for (const topic of chosenTopics) {
          const qs = shuffle(topic.questions)
            .slice(0, PER_TOPIC)
            .map((q: any) => q.question);
          questions.push(...qs);
        }
      } else {
        // Extremely unlikely fallback: not enough topics with 3+ questions.
        for (const topic of data.part1 || []) {
          for (const q of topic.questions || []) {
            if (q?.question) questions.push(q.question);
          }
        }
        questions = shuffle(questions).slice(0, 6);
      }

      const TARGET = 6;
      if (questions.length < TARGET) {
        const extra = await generateQuestions(1, TARGET - questions.length);
        questions = [...questions, ...extra].slice(0, TARGET);
      }
      return NextResponse.json({ part: 1, questions });
    }

    if (part === 2) {
      const cues: any[] = data.part2 || [];
      const cueIndex = cues.length ? Math.floor(Math.random() * cues.length) : -1;
      const rawCue = cueIndex >= 0 ? cues[cueIndex] : null;

      const cue = rawCue
        ? { question: extractCueQuestion(rawCue.topic || ""), bullets: rawCue.bullets || [] }
        : await generateCueCard();

      // Carry the same cue's Part 3 questions along so the discussion stays
      // thematically linked to the cue card, as in a real exam.
      const PART3_TARGET = 5;
      let part3Questions: string[] = (rawCue?.part3_questions || [])
        .map((q: any) => q?.question)
        .filter(Boolean);
      part3Questions = shuffle(part3Questions).slice(0, PART3_TARGET);
      if (part3Questions.length < PART3_TARGET) {
        const extra = await generateQuestions(3, PART3_TARGET - part3Questions.length);
        part3Questions = [...part3Questions, ...extra].slice(0, PART3_TARGET);
      }

      return NextResponse.json({
        part: 2,
        questions: [cue.question || "Describe something interesting."],
        bullets: cue.bullets || [],
        part3_questions: part3Questions,
      });
    }

    if (part === 3) {
      const TARGET = 5;
      // Standalone Part 3 practice (no linked Part 2 cue): pool from all
      // cue cards' part3_questions and pick a random set.
      const part3Bank: string[] = [];
      for (const cue of data.part2 || []) {
        for (const q of cue.part3_questions || []) {
          if (q?.question) part3Bank.push(q.question);
        }
      }
      let questions = shuffle(part3Bank).slice(0, TARGET);
      if (questions.length < TARGET) {
        const extra = await generateQuestions(3, TARGET - questions.length);
        questions = [...questions, ...extra].slice(0, TARGET);
      }
      return NextResponse.json({ part: 3, questions });
    }

    return NextResponse.json({ part: 1, questions: [] });
  } catch {
    const p = parseInt(params.part);
    const fallback: Record<number, string[]> = {
      1: [
        "Tell me about where you live.",
        "Do you work or study?",
        "What do you enjoy doing in your free time?",
      ],
      2: ["Describe a person who has influenced your life."],
      3: [
        "Do you think technology has changed communication?",
        "What are advantages of living in a big city?",
      ],
    };
    return NextResponse.json({
      part: p,
      questions: fallback[p] || ["Please speak about a topic you are interested in."],
    });
  }
}
