import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import { join } from "path";
import { generateJSON } from "@/lib/gemini";

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

export async function GET(
  _req: NextRequest,
  { params }: { params: { part: string } }
) {
  try {
    const part = parseInt(params.part);
    const filePath = join(process.cwd(), "data", "speaking_questions.json");
    const raw = await fs.readFile(filePath, "utf-8");
    const data = JSON.parse(raw);

    const collect = (topics: { questions?: { question: string }[] }[]): string[] => {
      const all: string[] = [];
      for (const topic of topics || []) {
        for (const q of topic.questions || []) {
          if (q?.question) all.push(q.question);
        }
      }
      return all.sort(() => 0.5 - Math.random());
    };

    if (part === 1) {
      const TARGET = 6;
      let questions = collect(data.part1).slice(0, TARGET);
      if (questions.length < TARGET) {
        const extra = await generateQuestions(1, TARGET - questions.length);
        questions = [...questions, ...extra].slice(0, TARGET);
      }
      return NextResponse.json({ part: 1, questions });
    }

    if (part === 2) {
      const cues = data.part2 || [];
      const randomCue = cues.length
        ? cues[Math.floor(Math.random() * cues.length)]
        : await generateCueCard();
      return NextResponse.json({
        part: 2,
        questions: [randomCue.question || "Describe something interesting."],
        bullets: randomCue.bullets || [],
      });
    }

    if (part === 3) {
      const TARGET = 5;
      // Part 3 questions live inside each Part 2 cue card as `part3_questions`.
      const part3Bank: string[] = [];
      for (const cue of data.part2 || []) {
        for (const q of cue.part3_questions || []) {
          if (q?.question) part3Bank.push(q.question);
        }
      }
      let questions = part3Bank.sort(() => 0.5 - Math.random()).slice(0, TARGET);
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
