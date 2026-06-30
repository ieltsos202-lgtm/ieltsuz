import { ArrowUp, ArrowDown, Minus } from "lucide-react";

import { Card } from "@/components/ui/card";
import { BandScore } from "@/components/shared/BandScore";

export function StatsCard({
  icon,
  label,
  score,
  delta,
}: {
  icon: string;
  label: string;
  score: number | null;
  delta: number;
}) {
  const Trend =
    delta > 0 ? ArrowUp : delta < 0 ? ArrowDown : Minus;
  const trendColor =
    delta > 0
      ? "text-accent-green"
      : delta < 0
      ? "text-accent-red"
      : "text-content-secondary";

  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-2xl">{icon}</span>
        <span className={`flex items-center gap-1 text-xs font-medium ${trendColor}`}>
          <Trend className="h-3 w-3" />
          {delta > 0 ? "+" : ""}
          {delta.toFixed(1)} this week
        </span>
      </div>
      <div>
        <p className="text-sm text-content-secondary">{label}</p>
        <BandScore score={score} size="md" />
      </div>
    </Card>
  );
}
