'use client';

import { cn } from '@/lib/utils';

interface BarData {
  label: string;
  value: number;
  displayValue?: string;
}

interface BarChartProps {
  data: BarData[];
  color?: string;
  height?: number;
}

export default function BarChart({
  data,
  color = 'bg-primary-500',
  height = 200,
}: BarChartProps) {
  const maxValue = Math.max(...data.map((d) => d.value), 1);

  return (
    <div className="flex w-full items-end gap-2" style={{ height }}>
      {data.map((item, index) => {
        const barHeight = (item.value / maxValue) * 100;
        return (
          <div key={index} className="flex flex-1 flex-col items-center gap-1">
            {item.displayValue && (
              <span className="text-xs font-medium text-gray-600">{item.displayValue}</span>
            )}
            <div
              className={cn(
                'w-full rounded-t-md transition-all duration-300',
                color
              )}
              style={{ height: `${barHeight}%` }}
            />
            <span className="text-xs text-gray-500">{item.label}</span>
          </div>
        );
      })}
    </div>
  );
}
