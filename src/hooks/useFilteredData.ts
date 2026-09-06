import { useMemo } from 'react';

interface FilterConfig {
  searchFields: string[];
  searchTerm: string;
  filters?: Record<string, string>;
  filterAllLabel?: string;
}

export function useFilteredData<T extends Record<string, any>>(
  data: T[],
  config: FilterConfig
): T[] {
  const { searchFields, searchTerm, filters = {}, filterAllLabel = 'Todos' } = config;

  return useMemo(() => {
    let result = data;

    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      result = result.filter((item) =>
        searchFields.some((field) => {
          const value = item[field];
          return value && String(value).toLowerCase().includes(term);
        })
      );
    }

    Object.entries(filters).forEach(([key, value]) => {
      if (value && value !== filterAllLabel) {
        result = result.filter((item) => {
          const itemValue = item[key];
          if (typeof itemValue === 'string') {
            return itemValue === value || itemValue.includes(value);
          }
          return String(itemValue) === value;
        });
      }
    });

    return result;
  }, [data, searchTerm, searchFields, filters, filterAllLabel]);
}
