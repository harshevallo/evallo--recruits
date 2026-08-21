import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { COMPANY_ROLE_LABELS } from '@evallo/shared';
import { Avatar, Icon } from '@/components/ui';
import { PATHS, buildPath } from '@/router/paths';

/**
 * HOME-01 context switcher (PRD §5.2, §5.3).
 *
 * Lists "Personal" and every company the user belongs to. Switching navigates to that company's
 * URL rather than setting client state — TRD §4.1 keeps company context in the path so links stay
 * shareable, browser back/forward works across switches, and the server can verify the context on
 * every request.
 *
 * The list is derived from `capabilities.companies`, which the server recomputes per request, so a
 * revoked membership disappears on the next load (ADR-001, ADR-006). Nothing here reads a role
 * stored on the user, because none exists.
 */
export function ContextSwitcher({ companies = [], current = 'personal', personalPath = PATHS.APP_HOME }) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const buttonRef = useRef(null);

  // Close on outside click and on Escape — a dropdown that traps the user is an a11y failure.
  useEffect(() => {
    if (!open) return undefined;

    function onPointerDown(event) {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    }
    function onKeyDown(event) {
      if (event.key === 'Escape') {
        setOpen(false);
        buttonRef.current?.focus();
      }
    }

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const activeCompany = companies.find((c) => c.slug === current);
  const label = activeCompany ? activeCompany.name : 'Personal';

  function choose(destination) {
    setOpen(false);
    navigate(destination);
  }

  return (
    <div className="relative" ref={rootRef}>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex w-full items-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-left transition-colors hover:border-gray-300 focus:outline-none focus:ring-2 focus:ring-brand-blue focus:ring-offset-2 sm:w-64"
      >
        {activeCompany ? (
          <Avatar
            src={activeCompany.logoUrl}
            initials={activeCompany.initials}
            size="sm"
            shape="rounded"
            tone="brand"
          />
        ) : (
          <span
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-sm text-brand-blue"
            aria-hidden="true"
          >
            <Icon name="user" />
          </span>
        )}

        <span className="min-w-0 flex-1">
          {/* "Workspace", matching the account menu's switcher — one act, one word (ADR-001). */}
          <span className="block text-[11px] uppercase tracking-wide text-gray-400">Workspace</span>
          <span className="block truncate text-sm font-semibold text-brand-dark">{label}</span>
        </span>

        <Icon name="chevron-down" className="shrink-0 text-xs text-gray-400" />
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Switch context"
          className="absolute left-0 z-20 mt-2 w-full min-w-[16rem] overflow-hidden rounded-xl border border-gray-100 bg-white py-1 shadow-lg sm:w-72"
        >
          <p className="px-4 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
            Personal
          </p>
          <ContextOption
            selected={!activeCompany}
            onSelect={() => choose(personalPath)}
            title="Personal"
            subtitle="Your profile and candidate activity"
            icon="user"
          />

          <p className="px-4 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
            Companies
          </p>

          {companies.length === 0 ? (
            <p className="px-4 pb-3 pt-1 text-sm text-gray-500">
              You do not belong to a company yet.
            </p>
          ) : (
            companies.map((company) => (
              <ContextOption
                key={company.companyId}
                selected={company.slug === current}
                onSelect={() => choose(buildPath(PATHS.COMPANY_HOME, { companySlug: company.slug }))}
                title={company.name}
                subtitle={COMPANY_ROLE_LABELS[company.role] ?? company.role}
                logoUrl={company.logoUrl}
                initials={company.initials}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}

function ContextOption({ selected, onSelect, title, subtitle, icon, logoUrl, initials }) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onSelect}
      aria-current={selected ? 'true' : undefined}
      className={`flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-gray-50 focus:bg-gray-50 focus:outline-none ${
        selected ? 'bg-blue-50/60' : ''
      }`}
    >
      {icon ? (
        <span
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-sm text-brand-blue"
          aria-hidden="true"
        >
          <Icon name={icon} />
        </span>
      ) : (
        <Avatar src={logoUrl} initials={initials} size="sm" shape="rounded" tone="brand" />
      )}

      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-brand-dark">{title}</span>
        <span className="block truncate text-xs text-gray-500">{subtitle}</span>
      </span>

      {selected && <Icon name="circle-check" className="shrink-0 text-sm text-brand-blue" />}
    </button>
  );
}
