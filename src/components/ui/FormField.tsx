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
      <label className="block text-[13px] font-medium text-fg-2">
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
        className="input-field"
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
        className="input-field"
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
