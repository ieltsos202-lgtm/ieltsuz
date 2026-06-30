import { Card, CardTitle } from "@/components/ui/card";
import { BandScore } from "@/components/shared/BandScore";
import type { DashboardOverview } from "@/lib/types";

const skillIcon: Record<string, string> = {
  listening: "🎧",
  reading: "📖",
  writing: "✍️",
  speaking: "🎙️",
};

function timeAgo(iso: string | null): string {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const hours = Math.floor(diff / (1000 * 60 * 60));
  if (hours < 1) return "just now";
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function RecentActivity({
  activity,
}: {
  activity: DashboardOverview["recent_activity"];
}) {
  return (
    <Card>
      <CardTitle>Recent activity</CardTitle>
      {activity.length === 0 ? (
        <p className="mt-4 text-sm text-content-secondary">
          No activity yet. Start a practice session to see your history here.
        </p>
      ) : (
        <ul className="mt-4 space-y-3">
          {activity.map((a, i) => (
            <li
              key={i}
              className="flex items-center justify-between rounded-[var(--radius)] bg-bg-tertiary px-4 py-3"
            >
              <div className="flex items-center gap-3">
                <span className="text-xl">{skillIcon[a.skill]}</span>
                <div>
                  <p className="text-sm font-medium capitalize">{a.skill}</p>
                  <p className="text-xs text-content-secondary">
                    {timeAgo(a.created_at)}
                  </p>
                </div>
              </div>
              <BandScore score={a.band_score} size="sm" />
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
