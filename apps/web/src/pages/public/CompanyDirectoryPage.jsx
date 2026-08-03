import { useState } from 'react';
import { Button, Container, Icon, Pagination } from '@/components/ui';
import { EmptyState } from '@/components/feedback/EmptyState';
import { CompanyCardSkeleton } from '@/components/feedback/Skeleton';
import { CompanyCard } from '@/features/companies/components/CompanyCard';
import { DirectoryFilters } from '@/features/companies/components/DirectoryFilters';
import { DirectoryToolbar } from '@/features/companies/components/DirectoryToolbar';
import { useDirectoryFilters } from '@/features/companies/hooks/useDirectoryFilters';
import {
  usePublicCompanies,
  useDirectoryFacets,
} from '@/features/companies/hooks/usePublicCompanies';
import { PATHS } from '@/router/paths';

/**
 * PUB-01 — public company directory (PRD §9.1).
 *
 * Anonymous, no authentication. Browsable and filterable by organization type, location,
 * programs, and active hiring roles. Filter state lives in the URL so results are shareable.
 */
/**
 * @param {object} props
 * @param {string} [props.profilePath]  Where a card links. CAN-05 renders this exact page at
 *   /me/companies with the signed-in company route, rather than duplicating the directory.
 */
export function CompanyDirectoryPage({ profilePath = PATHS.COMPANY_PROFILE }) {
  const {
    searchParams,
    filters,
    toggleValue,
    setValue,
    setPage,
    clearAll,
    activeCount,
    hasFilters,
  } = useDirectoryFilters();

  const { companies, meta, isLoading, isError, isEmpty, error, retry } =
    usePublicCompanies(searchParams);
  const facets = useDirectoryFacets();

  const [filtersOpen, setFiltersOpen] = useState(false);

  return (
    <>
      {/* Header */}
      <section className="border-b border-gray-100 bg-brand-light pb-12 pt-32">
        <Container>
          <h1 className="text-3xl font-bold tracking-tight text-brand-dark md:text-4xl">
            Discover education organizations
          </h1>
          <p className="mt-3 max-w-2xl text-lg text-gray-600">
            Browse tutoring businesses, schools, and education companies — and see who is hiring
            right now.
          </p>
        </Container>
      </section>

      <section className="bg-white py-10">
        <Container>
          {/* Mobile filter toggle */}
          <div className="mb-4 lg:hidden">
            <Button
              variant="outlineDark"
              size="sm"
              radius="lg"
              onClick={() => setFiltersOpen((open) => !open)}
              aria-expanded={filtersOpen}
              aria-controls="directory-filters"
              className="border-gray-300 !text-brand-dark hover:bg-gray-50"
            >
              <Icon name="filter" />
              Filters
              {activeCount > 0 && (
                <span className="ml-1 rounded-full bg-brand-blue px-2 py-0.5 text-xs text-white">
                  {activeCount}
                </span>
              )}
            </Button>
          </div>

          <div className="grid grid-cols-1 gap-8 lg:grid-cols-[280px_1fr]">
            <aside
              id="directory-filters"
              className={filtersOpen ? 'block' : 'hidden lg:block'}
            >
              <div className="lg:sticky lg:top-24">
                <DirectoryFilters
                  filters={filters}
                  facets={facets}
                  onToggle={toggleValue}
                  onSetValue={setValue}
                  onClear={clearAll}
                  hasFilters={hasFilters}
                />
              </div>
            </aside>

            <div>
              <DirectoryToolbar
                query={filters.q}
                sort={filters.sort}
                resultCount={meta?.total ?? 0}
                isLoading={isLoading}
                onSearch={(value) => setValue('q', value || null)}
                onSort={(value) => setValue('sort', value)}
              />

              {isLoading && (
                <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                  {Array.from({ length: 6 }, (_, i) => (
                    <CompanyCardSkeleton key={i} />
                  ))}
                </div>
              )}

              {isError && (
                <EmptyState
                  icon="file-shield"
                  title="We couldn't load the directory"
                  description={error?.message ?? 'Something went wrong. Please try again.'}
                  action={
                    <Button variant="primary" size="md" onClick={retry}>
                      Try again
                    </Button>
                  }
                />
              )}

              {isEmpty && (
                <EmptyState
                  title="No companies match these filters"
                  description={
                    hasFilters
                      ? 'Try removing a filter or broadening your search.'
                      : 'No companies have published a profile yet. Check back soon.'
                  }
                  action={
                    hasFilters ? (
                      <Button variant="primary" size="md" onClick={clearAll}>
                        Clear all filters
                      </Button>
                    ) : (
                      <Button to={PATHS.HOME} variant="primary" size="md">
                        Back to home
                      </Button>
                    )
                  }
                />
              )}

              {!isLoading && !isError && companies.length > 0 && (
                <>
                  <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                    {companies.map((company) => (
                      <div key={company.id} className="relative">
                        <CompanyCard company={company} profilePath={profilePath} />
                      </div>
                    ))}
                  </div>

                  {meta && meta.totalPages > 1 && (
                    <div className="mt-10">
                      <Pagination
                        page={meta.page}
                        totalPages={meta.totalPages}
                        onChange={setPage}
                      />
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </Container>
      </section>
    </>
  );
}
