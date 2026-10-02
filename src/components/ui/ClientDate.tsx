'use client';

import { useEffect, useState } from 'react';

interface ClientDateProps {
  date: string;
  options?: Intl.DateTimeFormatOptions;
  fallback?: string;
  dateTime?: boolean;
}

export default function ClientDate({ date, options, fallback = '...', dateTime = false }: ClientDateProps) {
  const [formatted, setFormatted] = useState(fallback);
  const optionsKey = JSON.stringify(options ?? {});

  useEffect(() => {
    // 'YYYY-MM-DD' (fecha civil) se interpreta en hora local: new Date('2026-10-02')
    // es medianoche UTC y en Tijuana se mostraba como el día anterior (1 oct).
    const civil = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date || '');
    const value = civil ? new Date(Number(civil[1]), Number(civil[2]) - 1, Number(civil[3])) : new Date(date);
    setFormatted(dateTime
      ? value.toLocaleString('es-MX', options)
      : value.toLocaleDateString('es-MX', options));
  }, [date, dateTime, optionsKey]);

  return <>{formatted}</>;
}
