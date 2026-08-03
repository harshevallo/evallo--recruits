import { useEffect, useState } from 'react';
import { COMPANY_DIRECTORY_SORT_OPTIONS } from '@evallo/shared';
import { Icon } from '@/components/ui';
import { useDebounce } from '@/hooks/useDebounce';

/** Keyword search + sort. Search is debounced so typing does not fire a request per keystroke. */
export function DirectoryToolbar({ query, sort, resultCount, isLoading, onSearch, onSort }) {
  const [term, setTerm] = useState(query);
  const debounced = useDebounce(term, 350);

  // Keep the input in sync when filters are cleared externally.
  useEffect(() => {
    setTerm(query);
  }, [query]);

  useEffect(() => {
    if (debounced !== query) onSearch(debounced);
    // onSearch is stable; re-running on `query` would fight the user's typing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced]);

  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="relative flex-1 sm:max-w-md">
        <label htmlFor="directory-search" className="sr-only">
          Search companies
        </label>
        <Icon
          name="filter"
          className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-gray-400"
        />
        <input
          id="directory-search"
          type="search"
          value={term}
          onChange={(event) => setTerm(event.target.value)}
          placeholder="Search companies, programs, or subjects"
          className="w-full rounded-full border border-gray-300 py-3 pl-11 pr-4 text-sm focus:border-brand-blue focus:outline-none focus:ring-2 focus:ring-brand-blue"
        />
      </div>

      <div className="flex items-center gap-4">
        <p className="text-sm text-gray-500" aria-live="polite">
          {isLoading
            ? 'Searching…'
            : `${resultCount} ${resultCount === 1 ? 'company' : 'companies'}`}
        </p>

        <div>
          <label htmlFor="directory-sort" className="sr-only">
            Sort results
          </label>
          <select
            id="directory-sort"
            value={sort}
            onChange={(event) => onSort(event.target.value)}
            className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-brand-blue focus:outline-none focus:ring-2 focus:ring-brand-blue"
          >
            {COMPANY_DIRECTORY_SORT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}
