'use client';

import { cn } from '@/lib/utils';

interface FormFieldProps {
  label: string;
  required?: boolean;
  children: React.ReactNode;
  className?: string;
}

export default function FormField({
  label,
  required,
  children,
  className,
}: FormFieldProps) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <label className="block text-xs font-semibold uppercase tracking-widest text-gray-500 dark:text-[#71767B]">
        {label}
        {required && <span className="ml-0.5 text-red-500">*</span>}
      </label>
      {children}
    </div>
  );
}

interface FormInputProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
  required?: boolean;
  className?: string;
}

export function FormInput({
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
  required,
  className,
}: FormInputProps) {
  return (
    <FormField label={label} required={required} className={className}>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        className="block w-full rounded-lg border border-gray-200 dark:border-[#2F3336] bg-white dark:bg-[#202327] px-3 py-2 text-sm text-gray-900 dark:text-[#E7E9EA] placeholder-gray-400 dark:placeholder-[#71767B] shadow-sm transition-colors focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 dark:focus:ring-[#1D9BF0]/30 dark:focus:border-[#1D9BF0]"
      />
    </FormField>
  );
}

interface FormSelectProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: string[];
  displayOptions?: string[];
  required?: boolean;
  className?: string;
}

export function FormSelect({
  label,
  value,
  onChange,
  options,
  displayOptions,
  required,
  className,
}: FormSelectProps) {
  return (
    <FormField label={label} required={required} className={className}>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        className="block w-full rounded-lg border border-gray-200 dark:border-[#2F3336] bg-white dark:bg-[#202327] px-3 py-2 text-sm text-gray-900 dark:text-[#E7E9EA] shadow-sm transition-colors focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 dark:focus:ring-[#1D9BF0]/30 dark:focus:border-[#1D9BF0]"
      >
        {options.map((option, i) => (
          <option key={option} value={option}>
            {displayOptions ? displayOptions[i] || option : option}
          </option>
        ))}
      </select>
    </FormField>
  );
}
