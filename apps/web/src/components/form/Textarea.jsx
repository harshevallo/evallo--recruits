import { cn } from '@/utils/cn';

export function Textarea({ hasError, rows = 4, className, ...props }) {
  return (
    <textarea
      rows={rows}
      className={cn(
        'w-full rounded-xl border bg-white px-4 py-3 text-sm font-medium text-brand-dark shadow-sm',
        'transition-colors placeholder:font-normal placeholder:text-gray-400',
        'focus:outline-none focus:border-brand-blue focus:ring-4 focus:ring-brand-blue/15',
        hasError ? 'border-red-500' : 'border-slate-200',
        className,
      )}
      {...props}
    />
  );
}
