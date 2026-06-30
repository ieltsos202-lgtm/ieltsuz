"use client";

import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

const COLORS = ["#0ea5e9", "#f59e0b", "#10b981", "#ef4444", "#8b5cf6", "#ec4899"];

export type Task1ChartData = {
  type: "bar" | "line" | "pie" | "table";
  title?: string;
  xAxisLabels: string[];
  series: { name: string; data: number[] }[];
  unit?: string;
  pieData?: { name: string; value: number }[];
  tableColumns?: string[];
  tableRows?: { label: string; values: (number | string)[] }[];
};

function transformForRecharts(labels: string[], series: { name: string; data: number[] }[]) {
  return labels.map((label, i) => {
    const row: Record<string, string | number> = { name: label };
    series.forEach((s) => {
      row[s.name] = s.data[i] ?? 0;
    });
    return row;
  });
}

export function Task1Chart({ data }: { data: Task1ChartData }) {
  if (data.type === "table" && data.tableRows && data.tableColumns) {
    return (
      <div className="mt-4 overflow-x-auto rounded-lg border border-border bg-bg-secondary">
        {data.title && (
          <p className="px-4 pt-3 text-xs font-semibold text-content-secondary">{data.title}</p>
        )}
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-bg-tertiary">
              {data.tableColumns.map((col, i) => (
                <th key={i} className="px-3 py-2 text-left font-medium text-content-primary">
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.tableRows.map((row, ri) => (
              <tr key={ri} className="border-b border-border last:border-0">
                <td className="px-3 py-2 font-medium text-content-primary">{row.label}</td>
                {row.values.map((val, vi) => (
                  <td key={vi} className="px-3 py-2 text-content-secondary">
                    {val}
                    {data.unit && typeof val === "number" ? ` ${data.unit}` : ""}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (data.type === "pie" && data.pieData) {
    return (
      <div className="mt-4 rounded-lg border border-border bg-bg-secondary p-4">
        {data.title && (
          <p className="mb-2 text-xs font-semibold text-content-secondary">{data.title}</p>
        )}
        <ResponsiveContainer width="100%" height={280}>
          <PieChart>
            <Pie
              data={data.pieData}
              cx="50%"
              cy="50%"
              outerRadius={90}
              dataKey="value"
              label={({ name, percent }) =>
                `${name}: ${(percent * 100).toFixed(0)}%`
              }
            >
              {data.pieData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip
              formatter={(value: number) =>
                data.unit ? [`${value} ${data.unit}`, ""] : [value, ""]
              }
            />
            <Legend />
          </PieChart>
        </ResponsiveContainer>
      </div>
    );
  }

  const chartData = transformForRecharts(data.xAxisLabels, data.series);

  if (data.type === "line") {
    return (
      <div className="mt-4 rounded-lg border border-border bg-bg-secondary p-4">
        {data.title && (
          <p className="mb-2 text-xs font-semibold text-content-secondary">{data.title}</p>
        )}
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
            <XAxis dataKey="name" tick={{ fontSize: 12, fill: "#94a3b8" }} />
            <YAxis tick={{ fontSize: 12, fill: "#94a3b8" }} />
            <Tooltip
              contentStyle={{
                backgroundColor: "#1e293b",
                border: "1px solid #334155",
                borderRadius: "8px",
                color: "#e2e8f0",
              }}
            />
            <Legend />
            {data.series.map((s, i) => (
              <Line
                key={s.name}
                type="monotone"
                dataKey={s.name}
                stroke={COLORS[i % COLORS.length]}
                strokeWidth={2}
                dot={{ r: 3 }}
                activeDot={{ r: 5 }}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    );
  }

  // Default: bar chart
  return (
    <div className="mt-4 rounded-lg border border-border bg-bg-secondary p-4">
      {data.title && (
        <p className="mb-2 text-xs font-semibold text-content-secondary">{data.title}</p>
      )}
      <ResponsiveContainer width="100%" height={280}>
        <BarChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
          <XAxis dataKey="name" tick={{ fontSize: 12, fill: "#94a3b8" }} />
          <YAxis tick={{ fontSize: 12, fill: "#94a3b8" }} />
          <Tooltip
            contentStyle={{
              backgroundColor: "#1e293b",
              border: "1px solid #334155",
              borderRadius: "8px",
              color: "#e2e8f0",
            }}
          />
          <Legend />
          {data.series.map((s, i) => (
            <Bar key={s.name} dataKey={s.name} fill={COLORS[i % COLORS.length]} radius={[4, 4, 0, 0]} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
