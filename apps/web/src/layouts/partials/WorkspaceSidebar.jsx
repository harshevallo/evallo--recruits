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
 *
 * ── Grouping ──────────────────────────────────────────────────────────────────────────────────
 *
 * `items` may be a flat array or an array of `{ group, label, items }`. Grouping exists because a
 * flat list makes every destination equally weighted, and the candidate rail has two genuinely
 * different kinds of destination: things you do TODAY, and things you maintain OCCASIONALLY.
 * Reading seven undifferentiated links is how "Visibility" ends up being visited as often as
 * "Messages", which is not what either is for.
 *
 * Collapsed, the group HEADINGS disappear but a hairline rule stays between groups: at 4.5rem
 * there is no room for a word, and losing the boundary entirely would flatten the structure the
 * grouping exists to express.
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

/** A flat array is one unlabelled group, so the renderer only ever handles one shape. */
function toGroups(items) {
  if (items.length === 0) return [];
  return items[0]?.items ? items : [{ group: 'default', label: null, items }];
}

/**
 * The count beside a destination.
 *
 * Only ever drawn for a POSITIVE count. A badge reading "0" is a claim that something is waiting
 * when nothing is, and it trains people to ignore the badge that matters. `99+` caps the width so
 * a long-neglected inbox cannot push the label out of the rail.
 */
function NavBadge({ count, expanded, label }) {
  if (!count || count < 1) return null;

  const display = count > 99 ? '99+' : String(count);

  /*
   * Collapsed, the number has nowhere to go, so it becomes a dot anchored to the icon. The
   * accessible text still carries the real count — the visual is a summary, not the information.
   */
  if (!expanded) {
    return (
      <span
        className="absolute right-2.5 top-2 h-2 w-2 rounded-full bg-brand-blue ring-2 ring-white"
        aria-hidden="true"
      />
    );
  }

  return (
    <span
      className="ml-auto min-w-[1.375rem] rounded-full bg-brand-blue px-1.5 py-0.5 text-center text-[11px] font-bold leading-none text-white"
      aria-label={`${count} ${label}`}
    >
      {display}
    </span>
  );
}

export function WorkspaceSidebar({ label, items, expanded, onToggle, mobileOpen, onMobileClose }) {
  const groups = toGroups(items);
  if (groups.length === 0) return null;

  const width = expanded ? 'w-64' : 'w-[4.5rem]';

  const list = (
    <div className="px-2 py-3">
      {groups.map((group, index) => (
        <div
          key={group.group}
          className={
            index > 0
              ? 'mt-1 border-t border-gray-100 pt-3'
              : ''
          }
        >
          {/*
            The heading is presentational: `aria-label` on the <ul> is what actually names the
            group for assistive technology, and duplicating it as a visible <p> AND an accessible
            name would announce it twice.
          */}
          {expanded && group.label && (
            <p
              aria-hidden="true"
              className="px-3 pb-1.5 pt-1 text-[10px] font-bold uppercase tracking-wider text-gray-400"
            >
              {group.label}
            </p>
          )}

          <ul className="space-y-1" aria-label={group.label ?? undefined}>
            {group.items.map((item) => (
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
                      'relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors',
                      expanded ? '' : 'justify-center',
                      isActive
                        ? 'bg-blue-50 font-semibold text-brand-blue'
                        : 'font-medium text-gray-600 hover:bg-gray-50 hover:text-brand-dark',
                    ].join(' ')
                  }
                >
                  <Icon
                    name={item.icon ?? 'circle-check'}
                    className="w-4 flex-none text-center text-sm"
                  />
                  {expanded && <span className="truncate">{item.label}</span>}
                  <NavBadge
                    count={item.badge}
                    expanded={expanded}
                    label={item.badgeLabel ?? 'pending'}
                  />
                </NavLink>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );

  return (
    <>
      {/*
        STICKY, not fixed — and that distinction is the whole point.

        A `fixed bottom-0` rail is glued to the viewport and overlaps whatever the page scrolls
        under it. Sticky keeps the rail in normal flow: it is a real column beside the content, so
        anything after that column sits after it and the two can never overlap however far the page
        scrolls. (The original overlap victim was the marketing footer, which the authenticated
        shell no longer renders — the reasoning holds regardless of what comes next.)

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
            {/*
              Always EXPANDED on mobile, whatever the desktop preference. The drawer is 16rem wide
              regardless, so honouring a "collapsed" preference here would render icon-only items
              in a full-width panel — the preference is about reclaiming desktop width, and there
              is no width to reclaim in an overlay.
            */}
            <div className="flex-1 overflow-y-auto">
              {expanded ? (
                list
              ) : (
                <WorkspaceSidebarList items={items} onNavigate={onMobileClose} />
              )}
            </div>
          </aside>
        </div>
      )}
    </>
  );
}

/**
 * The expanded list, standalone.
 *
 * Exists for the one case the main component cannot cover: a mobile drawer opened while the
 * desktop preference is "collapsed". Rendering `list` there would draw icon-only rows in a 16rem
 * panel.
 */
function WorkspaceSidebarList({ items, onNavigate }) {
  const groups = toGroups(items);

  return (
    <div className="px-2 py-3">
      {groups.map((group, index) => (
        <div key={group.group} className={index > 0 ? 'mt-1 border-t border-gray-100 pt-3' : ''}>
          {group.label && (
            <p
              aria-hidden="true"
              className="px-3 pb-1.5 pt-1 text-[10px] font-bold uppercase tracking-wider text-gray-400"
            >
              {group.label}
            </p>
          )}
          <ul className="space-y-1" aria-label={group.label ?? undefined}>
            {group.items.map((item) => (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  end={item.end ?? false}
                  onClick={onNavigate}
                  className={({ isActive }) =>
                    [
                      'relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors',
                      isActive
                        ? 'bg-blue-50 font-semibold text-brand-blue'
                        : 'font-medium text-gray-600 hover:bg-gray-50 hover:text-brand-dark',
                    ].join(' ')
                  }
                >
                  <Icon
                    name={item.icon ?? 'circle-check'}
                    className="w-4 flex-none text-center text-sm"
                  />
                  <span className="truncate">{item.label}</span>
                  <NavBadge count={item.badge} expanded label={item.badgeLabel ?? 'pending'} />
                </NavLink>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

/** The button that opens the rail on mobile, where the rail itself is off-canvas. */
export function SidebarTrigger({ onOpen, label, badge }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="mb-6 inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-brand-dark shadow-sm md:hidden"
    >
      <Icon name="bars" className="text-xs" /> {label}
      {/*
        The rail is off-canvas on a phone, so anything waiting inside it is invisible until the
        trigger is pressed. The dot is the only signal that opening it is worth doing.
      */}
      {badge > 0 && (
        <span
          className="ml-1 min-w-[1.25rem] rounded-full bg-brand-blue px-1.5 py-0.5 text-center text-[10px] font-bold leading-none text-white"
          aria-label={`${badge} items need attention`}
        >
          {badge > 99 ? '99+' : badge}
        </span>
      )}
    </button>
  );
}
