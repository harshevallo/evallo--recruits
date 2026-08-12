import { Suspense } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { RouteFallback } from '@/router/RouteFallback';
import { BackLink, Container } from '@/components/ui';
import { PATHS } from '@/router/paths';

/**
 * SET-01 shell.
 *
 * The settings area is a dashboard with sub-pages rather than one long form. Five unrelated concerns
 * — identity, security, notifications, privacy, data — have different save semantics and different
 * risk: one giant form would submit a password change and a notification toggle in the same request,
 * and a validation error in one would block the other.
 *
 * Sub-pages get a back link rather than a second sidebar; the workspace rails belong to the company
 * and candidate surfaces, and settings is neither.
 */

export const SETTINGS_SECTIONS = [
  {
    to: PATHS.SETTINGS_ACCOUNT,
    title: 'Account',
    description: 'Your personal account information',
    icon: 'user',
    action: 'Edit',
  },
  {
    to: PATHS.SETTINGS_SECURITY,
    title: 'Security',
    description: 'Password, sign-in methods and sessions',
    icon: 'shield-halved',
    action: 'Manage',
  },
  {
    to: PATHS.SETTINGS_NOTIFICATIONS,
    title: 'Notifications',
    description: 'Control how Evallo Recruit contacts you',
    icon: 'comments',
    action: 'Manage',
  },
  {
    to: PATHS.SETTINGS_PRIVACY,
    title: 'Privacy',
    description: 'Visibility, blocked companies and contact details',
    icon: 'eye',
    action: 'Manage',
  },
  {
    to: PATHS.SETTINGS_DATA,
    title: 'Your data',
    description: 'Export or manage your Evallo Recruit data',
    icon: 'file-shield',
    action: 'Manage',
  },
];

export function SettingsLayout() {
  const { pathname } = useLocation();
  const isRoot = pathname === PATHS.ACCOUNT_SETTINGS;

  return (
    <Container className="py-32">
      <div className="mx-auto max-w-3xl">
        {!isRoot && (
          <BackLink to={PATHS.ACCOUNT_SETTINGS} label="All settings" className="mb-6" />
        )}

        <Suspense fallback={<RouteFallback className="py-0" />}>
          <Outlet />
        </Suspense>
      </div>
    </Container>
  );
}
