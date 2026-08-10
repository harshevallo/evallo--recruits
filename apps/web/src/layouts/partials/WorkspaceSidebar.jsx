import { useEffect, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { Icon } from '@/components/ui';

/**
 * The workspace's collapsible left rail.
 *
 * Replaces the earlier top strip, which sat above the page and repeated actions the page already
 * offered. A rail keeps every destination visible without competing with the page's own content.
 *
 * Three states, one component:
 *   · desktop expanded  — icon + label, 16rem
 *   · desktop collapsed — icon only, 4.5rem; still every item, so nothing becomes undiscoverable
 *   · mobile            — off-canvas over a scrim, because 4.5rem of permanent chrome on a 375px
 *                         screen costs more than it returns
 *
 * The open/closed choice is remembered in localStorage: it is a per-person preference about their
 * own screen, so it belongs on the device rather than in the account.
 */

const STORAGE_KEY = 'evallo.workspace.sidebar';

/** Read once, defensively — a private-mode browser can throw on localStorage access. */
function readPreference() {
  try {
    return window.localStorage.getItem(STORAGE_KEY) !== 'collapsed';
  } catch {
    return true;
  }
}

export function useSidebarState() {
  const [expanded, setExpanded] = useState(readPreference);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, expanded ? 'expanded' : 'collapsed');
    } catch {
      /* Preference is a convenience; failing to persist it must not break the app. */
    }
  }, [expanded]);

  return { expanded, toggle: () => setExpanded((value) => !value) };
}

export function WorkspaceSidebar({ label, items, expanded, onToggle, mobileOpen, onMobileClose }) {
  if (items.length === 0) return null;

  const width = expanded ? 'w-64' : 'w-[4.5rem]';

  const list = (
    <ul className="space-y-1 px-2 py-3">
      {items.map((item) => (
        <li key={item.to}>
          <NavLink
            to={item.to}
            end={item.end ?? false}
            onClick={onMobileClose}
            /* The label is the accessible name when collapsed, where the text is not rendered. */
            title={expanded ? undefined : item.label}
            aria-label={expanded ? undefined : item.label}
            className={({ isActive }) =>
              [
                'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors',
                expanded ? '' : 'justify-center',
                isActive
                  ? 'bg-blue-50 font-semibold text-brand-blue'
                  : 'font-medium text-gray-600 hover:bg-gray-50 hover:text-brand-dark',
              ].join(' ')
            }
          >
            <Icon name={item.icon ?? 'circle-check'} className="w-4 flex-none text-center text-sm" />
            {expanded && <span className="truncate">{item.label}</span>}
          </NavLink>
        </li>
      ))}
    </ul>
  );

  return (
    <>
      {/*
        STICKY, not fixed — and that distinction is the whole point.

        A `fixed bottom-0` rail is glued to the viewport, so scrolling to the end of a page dragged it
        straight over the footer. Sticky keeps the rail in normal flow: it is a real column beside the
        content, the footer comes after that column, and the two can never overlap however far the
        page scrolls.

        `top-20` and the height calculation account for MarketingNavbar, which IS fixed and 5rem tall.
      */}
      <aside
        aria-label={label}
        className={`sticky top-20 hidden h-[calc(100vh-5rem)] shrink-0 border-r border-gray-200 bg-white transition-[width] duration-200 md:flex md:flex-col ${width}`}
      >
        <div
          className={`flex flex-none items-center border-b border-gray-100 px-2 py-2 ${
            expanded ? 'justify-between' : 'justify-center'
          }`}
        >
          {expanded && (
            <span className="pl-2 text-[11px] font-bold uppercase tracking-wider text-gray-400">
              {label}
            </span>
          )}
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={expanded}
            aria-label={expanded ? 'Collapse sidebar' : 'Expand sidebar'}
            className="rounded-lg p-2 text-gray-500 transition-colors hover:bg-gray-100 hover:text-brand-dark"
          >
            <Icon name={expanded ? 'chevron-left' : 'chevron-right'} className="text-xs" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">{list}</div>
      </aside>

      {/* Mobile off-canvas. */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <button
            type="button"
            aria-label="Close navigation"
            onClick={onMobileClose}
            className="absolute inset-0 h-full w-full cursor-default bg-brand-dark/40"
          />
          <aside
            aria-label={label}
            className="absolute bottom-0 left-0 top-20 flex w-64 flex-col border-r border-gray-200 bg-white shadow-xl"
          >
            <div className="flex flex-none items-center justify-between border-b border-gray-100 px-4 py-3">
              <span className="text-[11px] font-bold uppercase tracking-wider text-gray-400">
                {label}
              </span>
              <button
                type="button"
                onClick={onMobileClose}
                aria-label="Close navigation"
                className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100"
              >
                <Icon name="xmark" className="text-sm" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">{list}</div>
          </aside>
        </div>
      )}
    </>
  );
}

/** The button that opens the rail on mobile, where the rail itself is off-canvas. */
export function SidebarTrigger({ onOpen, label }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="mb-6 inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-brand-dark shadow-sm md:hidden"
    >
      <Icon name="bars" className="text-xs" /> {label}
    </button>
  );
}
