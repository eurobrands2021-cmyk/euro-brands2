"use client";

import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import { format } from "date-fns";
import { formatCurrency, formatNumber } from "@/lib/format";

interface Point {
  date: string;
  total: number;
}

const AR_DAYS = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border bg-surface px-3 py-2 text-sm shadow-card">
      <p className="mb-1 font-medium text-text">{label}</p>
      {payload.map((p: any) => (
        <p key={p.dataKey} className="nums" style={{ color: p.color }}>
          {p.name}: {formatCurrency(p.value)}
        </p>
      ))}
    </div>
  );
}

export function WeekComparisonChart({
  thisWeek,
  lastWeek,
}: {
  thisWeek: Point[];
  lastWeek: Point[];
}) {
  const data = thisWeek.map((tw, i) => {
    const lw = lastWeek[i];
    const dayName = AR_DAYS[new Date(tw.date).getDay()];
    return {
      label: `${dayName} ${format(new Date(tw.date), "d/M")}`,
      thisWeek: tw.total,
      lastWeek: lw?.total ?? 0,
    };
  });

  return (
    <div dir="ltr" className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
          <XAxis
            dataKey="label"
            tick={{ fill: "var(--muted)", fontSize: 11 }}
            stroke="var(--border)"
          />
          <YAxis
            tickFormatter={(v) => formatNumber(v)}
            tick={{ fill: "var(--muted)", fontSize: 12 }}
            stroke="var(--border)"
            width={56}
          />
          <Tooltip content={<CustomTooltip />} />
          <Legend
            formatter={(value) => (
              <span style={{ color: "var(--text)", fontSize: 13 }}>{value}</span>
            )}
          />
          <Line
            type="monotone"
            name="الأسبوع الحالي"
            dataKey="thisWeek"
            stroke="#6c63ff"
            strokeWidth={2.5}
            dot={{ r: 3, fill: "#6c63ff" }}
            activeDot={{ r: 5 }}
          />
          <Line
            type="monotone"
            name="الأسبوع السابق"
            dataKey="lastWeek"
            stroke="var(--muted)"
            strokeWidth={2}
            strokeDasharray="5 4"
            dot={{ r: 2.5, fill: "var(--muted)" }}
            activeDot={{ r: 4 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
