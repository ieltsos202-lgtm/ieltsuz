import { Card } from "@/components/ui/card";

function barColor(score: number): string {
  if (score >= 7) return "bg-accent-green";
  if (score >= 6) return "bg-accent";
  if (score >= 5) return "bg-accent-yellow";
  return "bg-accent-red";
}

export function CriterionCard({
  label,
  score,
  note,
}: {
  label: string;
  score: number;
  note?: string;
}) {
  return (
    <Card className="space-y-2 p-4">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-content-secondary">{label}</span>
        <span className="text-lg font-bold tabular-nums">{score.toFixed(1)}</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-bg-tertiary">
        <div
          className={`h-full rounded-full ${barColor(score)}`}
          style={{ width: `${(score / 9) * 100}%` }}
        />
      </div>
      {note && <p className="text-xs text-content-secondary">{note}</p>}
    </Card>
  );
}
