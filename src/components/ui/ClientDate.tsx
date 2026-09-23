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
    const value = new Date(date);
    setFormatted(dateTime
      ? value.toLocaleString('es-MX', options)
      : value.toLocaleDateString('es-MX', options));
  }, [date, dateTime, optionsKey]);

  return <>{formatted}</>;
}
