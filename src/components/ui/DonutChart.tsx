'use client';

import { cn } from '@/lib/utils';

interface DonutData {
  name: string;
  value: number;
  color: string;
}

interface DonutChartProps {
  data: DonutData[];
  centerLabel?: string;
  centerValue?: string;
}

export default function DonutChart({
  data,
  centerLabel,
  centerValue,
}: DonutChartProps) {
  const total = data.reduce((sum, d) => sum + d.value, 0);
  const radius = 60;
  const strokeWidth = 20;
  const circumference = 2 * Math.PI * radius;

  let accumulated = 0;

  return (
    <div className="flex items-center gap-6">
      <div className="relative">
        <svg width={160} height={160} viewBox="0 0 160 160">
          <circle
            cx={80}
            cy={80}
            r={radius}
            fill="none"
            stroke="#f3f4f6"
            strokeWidth={strokeWidth}
          />
          {data.map((item, index) => {
            const percentage = total > 0 ? (item.value / total) * 100 : 0;
            const strokeDasharray = (percentage / 100) * circumference;
            const strokeDashoffset = -((accumulated / 100) * circumference);
            accumulated += percentage;

            return (
              <circle
                key={index}
                cx={80}
                cy={80}
                r={radius}
                fill="none"
                stroke={item.color}
                strokeWidth={strokeWidth}
                strokeDasharray={`${strokeDasharray} ${circumference - strokeDasharray}`}
                strokeDashoffset={strokeDashoffset}
                strokeLinecap="round"
                transform="rotate(-90 80 80)"
                className="transition-all duration-500"
              />
            );
          })}
        </svg>
        {(centerLabel || centerValue) && (
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            {centerValue && (
              <span className="text-lg font-bold text-gray-900">{centerValue}</span>
            )}
            {centerLabel && (
              <span className="text-xs text-gray-500">{centerLabel}</span>
            )}
          </div>
        )}
      </div>
      <div className="space-y-2">
        {data.map((item, index) => (
          <div key={index} className="flex items-center gap-2">
            <span
              className="h-3 w-3 rounded-full"
              style={{ backgroundColor: item.color }}
            />
            <span className="text-sm text-gray-600">{item.name}</span>
            <span className="text-sm font-medium text-gray-900">{item.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
