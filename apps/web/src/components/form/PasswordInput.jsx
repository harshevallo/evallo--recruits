import { useState } from 'react';
import { passwordStrength } from '@evallo/shared';
import { Icon } from '@/components/ui';
import { cn } from '@/utils/cn';

const LABELS = ['Too weak', 'Weak', 'Fair', 'Good', 'Strong'];
const COLORS = ['bg-red-400', 'bg-red-400', 'bg-yellow-400', 'bg-blue-400', 'bg-green-500'];

/**
 * Password field with show/hide and an optional strength meter.
 *
 * The meter uses the SAME `passwordStrength` from the shared package that mirrors the server's
 * password policy, so the guidance a user sees matches what the API will accept.
 */
export function PasswordInput({ hasError, showStrength = false, value = '', className, ...props }) {
  const [visible, setVisible] = useState(false);
  const score = passwordStrength(value);

  return (
    <div>
      <div className="relative">
        <input
          type={visible ? 'text' : 'password'}
          value={value}
          className={cn(
            'w-full rounded-lg border px-4 py-3 pr-12',
            'focus:outline-none focus:ring-2 focus:ring-brand-blue focus:border-brand-blue',
            hasError ? 'border-red-500' : 'border-gray-300',
            className,
          )}
          {...props}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? 'Hide password' : 'Show password'}
          className="absolute right-3 top-1/2 -translate-y-1/2 rounded p-1 text-gray-400 hover:text-brand-dark"
          tabIndex={-1}
        >
          <Icon name={visible ? 'file-shield' : 'shield-halved'} />
        </button>
      </div>

      {showStrength && value.length > 0 && (
        <div className="mt-2" aria-hidden="true">
          <div className="flex gap-1">
            {[0, 1, 2, 3].map((i) => (
              <span
                key={i}
                className={cn(
                  'h-1 flex-1 rounded-full',
                  i < score ? COLORS[score] : 'bg-gray-200',
                )}
              />
            ))}
          </div>
          <p className="mt-1 text-xs text-gray-500">{LABELS[score]}</p>
        </div>
      )}
    </div>
  );
}
