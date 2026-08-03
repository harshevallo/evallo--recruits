import {
  ORGANIZATION_TYPE_OPTIONS,
  EDUCATION_SERVICE_OPTIONS,
  ROLE_CATEGORY_OPTIONS,
  DELIVERY_MODE_OPTIONS,
} from '@evallo/shared';
import { Button } from '@/components/ui';

function FilterGroup({ legend, name, options, selected, counts, onToggle }) {
  return (
    <fieldset className="border-t border-gray-100 py-5 first:border-t-0 first:pt-0">
      <legend className="mb-3 text-sm font-bold text-brand-dark">{legend}</legend>

      <div className="space-y-2">
        {options.map((option) => {
          const count = counts?.[option.value];
          const isChecked = selected.includes(option.value);

          return (
            <label
              key={option.value}
              className="flex cursor-pointer items-center gap-3 text-sm text-gray-600 hover:text-brand-dark"
            >
              <input
                type="checkbox"
                name={name}
                value={option.value}
                checked={isChecked}
                onChange={() => onToggle(name, option.value)}
                className="h-4 w-4 rounded border-gray-300 text-brand-blue focus:ring-brand-blue"
              />
              <span className="flex-1">{option.label}</span>
              {count !== undefined && <span className="text-xs text-gray-400">{count}</span>}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

/**
 * Directory filter panel — PRD §9.1: searchable by organization type, location, programs, and
 * active hiring roles.
 */
export function DirectoryFilters({ filters, facets, onToggle, onSetValue, onClear, hasFilters }) {
  const countries = Object.keys(facets?.country ?? {}).sort();

  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
      <div className="mb-5 flex items-center justify-between">
        <h2 className="text-base font-bold text-brand-dark">Filters</h2>
        {hasFilters && (
          <Button
            variant="link"
            size="none"
            radius="none"
            onClick={onClear}
            className="text-sm font-medium"
          >
            Clear all
          </Button>
        )}
      </div>

      <fieldset className="pb-5">
        <label className="flex cursor-pointer items-center gap-3 text-sm font-medium text-brand-dark">
          <input
            type="checkbox"
            checked={filters.hiringOnly === 'true'}
            onChange={(event) =>
              onSetValue('hiringOnly', event.target.checked ? 'true' : null)
            }
            className="h-4 w-4 rounded border-gray-300 text-brand-blue focus:ring-brand-blue"
          />
          <span className="flex-1">Currently hiring only</span>
          {facets?.hiring !== undefined && (
            <span className="text-xs text-gray-400">{facets.hiring}</span>
          )}
        </label>
      </fieldset>

      <FilterGroup
        legend="Organization type"
        name="organizationType"
        options={ORGANIZATION_TYPE_OPTIONS}
        selected={filters.organizationType}
        counts={facets?.organizationType}
        onToggle={onToggle}
      />

      <FilterGroup
        legend="Programs"
        name="service"
        options={EDUCATION_SERVICE_OPTIONS}
        selected={filters.service}
        counts={facets?.service}
        onToggle={onToggle}
      />

      <FilterGroup
        legend="Hiring for"
        name="roleCategory"
        options={ROLE_CATEGORY_OPTIONS}
        selected={filters.roleCategory}
        onToggle={onToggle}
      />

      <FilterGroup
        legend="Work model"
        name="deliveryMode"
        options={DELIVERY_MODE_OPTIONS}
        selected={filters.deliveryMode}
        counts={facets?.deliveryMode}
        onToggle={onToggle}
      />

      {countries.length > 0 && (
        <fieldset className="border-t border-gray-100 pt-5">
          <legend className="mb-3 text-sm font-bold text-brand-dark">Country</legend>
          <select
            value={filters.country ?? ''}
            onChange={(event) => onSetValue('country', event.target.value || null)}
            aria-label="Filter by country"
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-brand-blue focus:outline-none focus:ring-2 focus:ring-brand-blue"
          >
            <option value="">All countries</option>
            {countries.map((code) => (
              <option key={code} value={code}>
                {code} ({facets.country[code]})
              </option>
            ))}
          </select>
        </fieldset>
      )}
    </div>
  );
}
