import { Link } from 'react-router-dom';
import { Icon } from '@/components/ui';
import { PATHS } from '@/router/paths';
import { SETTINGS_SECTIONS } from './SettingsLayout';

/**
 * SET-01 dashboard.
 *
 * Cards, one per concern, each linking to its own page. The danger zone is at the bottom and visually
 * separated — deleting an account should never sit a few pixels from a notification toggle.
 */
export function SettingsHomePage() {
  return (
    <>
      <header className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight text-brand-dark">Account settings</h1>
        <p className="mt-2 text-gray-600">
          Manage your account, security, privacy and notifications.
        </p>
      </header>

      <ul className="space-y-3">
        {SETTINGS_SECTIONS.map((section) => (
          <li key={section.to}>
            <Link
              to={section.to}
              className="flex items-center gap-4 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm transition-colors hover:border-brand-blue/40 hover:bg-blue-50/20"
            >
              <span className="flex h-10 w-10 flex-none items-center justify-center rounded-xl bg-blue-50 text-brand-blue">
                <Icon name={section.icon} />
              </span>

              <span className="min-w-0 flex-1">
                <span className="block text-base font-bold text-brand-dark">{section.title}</span>
                <span className="block text-sm text-gray-600">{section.description}</span>
              </span>

              <span className="flex flex-none items-center gap-1.5 text-sm font-semibold text-brand-blue">
                {section.action} <Icon name="arrow-right" className="text-xs" />
              </span>
            </Link>
          </li>
        ))}
      </ul>

      {/*
        Danger zone. Deliberately below a divider and not styled as one more card: PRD §16.1 treats
        deletion as irreversible-by-design, so it should not read as a peer of "Notifications".
      */}
      <div className="mt-12 border-t border-gray-200 pt-8">
        <h2 className="text-center text-xs font-bold uppercase tracking-wider text-gray-400">
          Danger zone
        </h2>
        <div className="mt-4 rounded-2xl border border-red-200 bg-red-50/40 p-5 text-center">
          <p className="text-sm font-semibold text-brand-dark">Delete your Evallo Recruit account</p>
          <p className="mx-auto mt-1 max-w-md text-xs text-gray-600">
            Removes your account and personal data. Some records are retained where required for
            platform integrity or legal obligations.
          </p>
          <Link
            to={PATHS.SETTINGS_DATA}
            className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-red-600 transition-colors hover:text-red-700"
          >
            Go to account deletion <Icon name="arrow-right" className="text-xs" />
          </Link>
        </div>
      </div>
    </>
  );
}
