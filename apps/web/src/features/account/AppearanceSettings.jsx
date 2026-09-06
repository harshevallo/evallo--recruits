import { useRef, useState } from 'react';
import { THEME_PREFERENCES } from '@evallo/shared';
import { Icon } from '@/components/ui';
import { StatusRegion } from '@/components/feedback/StatusRegion';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/context/ThemeContext';
import { updateCurrentUser } from '@/services';
import { cn } from '@/utils/cn';

const OPTIONS = [
  {
    value: THEME_PREFERENCES.LIGHT,
    label: 'Light',
    icon: 'sun',
    description: 'Bright background, dark text.',
  },
  {
    value: THEME_PREFERENCES.DARK,
    label: 'Dark',
    icon: 'moon',
    description: 'Dark background, easier on the eyes at night.',
  },
  {
    value: THEME_PREFERENCES.SYSTEM,
    label: 'System',
    icon: 'circle-half-stroke',
    description: 'Follows your device setting.',
  },
];

/**
 * SET-01 → Account → Appearance. Light, dark, or follow the device.
 *
 * Applies IMMEDIATELY on click — a theme is something you see, and making someone press "Save
 * changes" to find out whether they like it would be ceremony — then saves to the account so the
 * choice follows them to their other devices. If the save fails the theme stays applied here and
 * the message says exactly that, rather than snapping the screen back.
 *
 * A radio group, not three buttons: one of three mutually exclusive values is a radio's job, and
 * arrow keys move between them the way a keyboard user expects.
 */
export function AppearanceSettings() {
  const { preference, resolved, setPreference } = useTheme();
  const { isAuthenticated, refresh } = useAuth();
  const [feedback, setFeedback] = useState(null);
  const inFlight = useRef(false);

  async function choose(value) {
    if (value === preference) return;
    setPreference(value);
    setFeedback(null);

    if (!isAuthenticated || inFlight.current) return;
    inFlight.current = true;
    try {
      await updateCurrentUser({ themePreference: value });
      await refresh();
      setFeedback({ tone: 'success', text: 'Saved. This theme follows your account on every device.' });
    } catch (error) {
      setFeedback({
        tone: 'error',
        text: `Applied on this device, but we could not save it to your account${
          error.message ? `: ${error.message}` : '.'
        }`,
      });
    } finally {
      inFlight.current = false;
    }
  }

  function onKeyDown(event) {
    const index = OPTIONS.findIndex((option) => option.value === preference);
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key];
    if (step === undefined) return;
    event.preventDefault();
    const next = OPTIONS[(index + step + OPTIONS.length) % OPTIONS.length];
    choose(next.value);
    event.currentTarget.querySelector(`[data-value="${next.value}"]`)?.focus();
  }

  return (
    <section
      aria-labelledby="appearance-heading"
      className="mb-6 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm"
    >
      <h2 id="appearance-heading" className="text-lg font-bold text-brand-dark">
        Appearance
      </h2>
      <p className="mb-4 mt-1 text-sm text-gray-600">
        Choose how Evallo Recruit looks to you.
        {preference === THEME_PREFERENCES.SYSTEM && (
          <> Your device is currently set to {resolved}.</>
        )}
      </p>

      <div
        role="radiogroup"
        aria-labelledby="appearance-heading"
        onKeyDown={onKeyDown}
        className="grid grid-cols-1 gap-3 sm:grid-cols-3"
      >
        {OPTIONS.map((option) => {
          const selected = option.value === preference;
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={selected}
              data-value={option.value}
              tabIndex={selected ? 0 : -1}
              onClick={() => choose(option.value)}
              className={cn(
                'flex items-start gap-3 rounded-xl border p-4 text-left transition-colors',
                selected
                  ? 'border-brand-blue bg-blue-50/60'
                  : 'border-gray-200 bg-white hover:bg-gray-50',
              )}
            >
              <span
                className={cn(
                  'flex h-9 w-9 flex-none items-center justify-center rounded-lg',
                  selected ? 'bg-brand-blue text-white' : 'bg-gray-100 text-gray-600',
                )}
              >
                <Icon name={option.icon} />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-brand-dark">{option.label}</span>
                <span className="block text-xs text-gray-600">{option.description}</span>
              </span>
            </button>
          );
        })}
      </div>

      {feedback && (
        <StatusRegion tone={feedback.tone} className="mt-4">
          {feedback.text}
        </StatusRegion>
      )}
    </section>
  );
}
