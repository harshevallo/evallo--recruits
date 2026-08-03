import { cn } from '@/utils/cn';

export function Textarea({ hasError, rows = 4, className, ...props }) {
  return (
    <textarea
      rows={rows}
      className={cn(
        'w-full rounded-lg border px-4 py-3',
        'focus:outline-none focus:ring-2 focus:ring-brand-blue focus:border-brand-blue',
        hasError ? 'border-red-500' : 'border-gray-300',
        className,
      )}
      {...props}
    />
  );
}
