"use client";

import {
  Radar,
  RadarChart as ReRadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
  Legend,
} from "recharts";

export function RadarChart({
  data,
}: {
  data: { skill: string; current: number; target: number }[];
}) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <ReRadarChart data={data} outerRadius="70%">
        <PolarGrid stroke="#2D2D3A" />
        <PolarAngleAxis
          dataKey="skill"
          tick={{ fill: "#94A3B8", fontSize: 12 }}
        />
        <PolarRadiusAxis
          domain={[0, 9]}
          tick={{ fill: "#94A3B8", fontSize: 10 }}
          axisLine={false}
        />
        <Radar
          name="Target"
          dataKey="target"
          stroke="#8B5CF6"
          strokeDasharray="4 4"
          fill="#8B5CF6"
          fillOpacity={0.05}
        />
        <Radar
          name="Current"
          dataKey="current"
          stroke="#6366F1"
          fill="#6366F1"
          fillOpacity={0.35}
        />
        <Legend wrapperStyle={{ fontSize: 12, color: "#94A3B8" }} />
      </ReRadarChart>
    </ResponsiveContainer>
  );
}
