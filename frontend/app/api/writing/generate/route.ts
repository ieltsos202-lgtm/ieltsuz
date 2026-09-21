import { NextRequest, NextResponse } from "next/server";
import { generateJSON } from "@/lib/gemini";
import writingPrompts from "@/data/writing_prompts.json";
import { rateLimit, clientIp } from "@/lib/rateLimit";

async function localPrompt(taskType: string): Promise<{ question: string; chart_data?: any } | null> {
  try {
    const data = writingPrompts as Record<string, any[]>;
    const prompts = data[taskType === "task1" ? "task1" : "task2"] || [];
    if (prompts.length === 0) return null;
    const item = prompts[Math.floor(Math.random() * prompts.length)];
    return { question: item.prompt, chart_data: item.chart_data };
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const taskType = url.searchParams.get("task_type") === "task1" ? "task1" : "task2";

  // Unauthenticated AI call — cap it, and skip the model entirely once the
  // limit is hit (the local bank below still serves a prompt).
  const limited = rateLimit(`writing-gen:${clientIp(req)}`, 20, 10 * 60_000);
  if (limited) {
    const local = await localPrompt(taskType);
    if (local) {
      return NextResponse.json({ question: local.question, chart_data: local.chart_data || null });
    }
  }

  // Generate a fresh, exam-realistic prompt with Gemini (our "latest
  // questions" source). Fall back to the local bank, then a static default.
  try {
    if (limited) throw new Error("rate-limited");
    if (taskType === "task1") {
      const data = await generateJSON(
        `Generate one recent, realistic IELTS Academic Writing Task 1 prompt.
Include BOTH the question text AND realistic chart data so a student can visualise the chart while writing.

Rules:
- Choose one chart type: bar chart, line graph, pie chart, or table.
- Provide realistic numbers (percentages, amounts, years, categories) that show clear trends or differences.
- The chart_data must be in this exact JSON structure:

{
  "question": "The [chart type] below shows ... Summarise the information by selecting and reporting the main features, and make comparisons where relevant.",
  "chart_data": {
    "type": "bar",
    "title": "Optional chart title",
    "xAxisLabels": ["2010", "2015", "2020", "2025"],
    "series": [
      { "name": "Category A", "data": [20, 35, 45, 55] },
      { "name": "Category B", "data": [30, 25, 40, 50] }
    ],
    "unit": "%"
  }
}

For pie charts use:
"chart_data": {
  "type": "pie",
  "title": "...",
  "pieData": [
    { "name": "Label 1", "value": 45 },
    { "name": "Label 2", "value": 30 }
  ],
  "unit": "%"
}

For tables use:
"chart_data": {
  "type": "table",
  "title": "...",
  "tableColumns": ["Category", "2010", "2020"],
  "tableRows": [
    { "label": "Group A", "values": [120, 180] },
    { "label": "Group B", "values": [90, 150] }
  ],
  "unit": "thousands"
}

Return ONLY valid JSON with both "question" and "chart_data" fields.`
      );
      if (typeof data?.question === "string" && data.question.trim()) {
        return NextResponse.json({
          question: data.question,
          chart_data: data.chart_data || null,
        });
      }
    } else {
      const data = await generateJSON(
        `Generate one recent, realistic IELTS Writing Task 2 essay prompt (an argument/opinion/discussion question to write at least 250 words). Use the style of the most recent IELTS exams.
Return ONLY valid JSON: {"question": "the full prompt"}`
      );
      if (typeof data?.question === "string" && data.question.trim()) {
        return NextResponse.json({ question: data.question });
      }
    }
  } catch {
    /* fall through to local bank */
  }

  const local = await localPrompt(taskType);
  if (local) {
    return NextResponse.json({
      question: local.question,
      chart_data: local.chart_data || null,
    });
  }

  return NextResponse.json({
    question:
      taskType === "task1"
        ? "The chart below shows changes in the urban population of a country over 50 years. Summarise the information by selecting and reporting the main features."
        : "Some people believe that technology has made our lives better, while others think it has made them worse. Discuss both views and give your own opinion.",
    chart_data: null,
  });
}
