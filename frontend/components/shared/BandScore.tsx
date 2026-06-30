import { cn } from "@/lib/utils";

function bandColor(score: number | null): string {
  if (score === null) return "text-content-secondary";
  if (score >= 7) return "text-accent-green";
  if (score >= 6) return "text-accent";
  if (score >= 5) return "text-accent-yellow";
  return "text-accent-red";
}

export function BandScore({
  score,
  size = "md",
  className,
}: {
  score: number | null;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const sizes = {
    sm: "text-xl",
    md: "text-3xl",
    lg: "text-5xl",
  };
  return (
    <span
      className={cn("font-extrabold tabular-nums", sizes[size], bandColor(score), className)}
    >
      {score === null ? "—" : score.toFixed(1)}
    </span>
  );
}
