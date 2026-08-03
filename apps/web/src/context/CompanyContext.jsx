import { createContext, useCallback, useContext, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { can as canDo } from '@evallo/shared';
import { useAuth } from './AuthContext';

const CompanyContext = createContext(null);

/**
 * The company the user is currently acting through.
 *
 * Read from the URL, not from client state — so a link carries its own context, back/forward
 * works across company switches, and the server can verify the same value independently.
 *
 * A user may belong to many companies with a different role in each. Nothing here is cached
 * per-user; it is always derived from the capabilities the API returned.
 */
export function CompanyProvider({ children }) {
  const { capabilities, refresh } = useAuth();
  const { companySlug } = useParams();

  const companies = useMemo(() => capabilities?.companies ?? [], [capabilities]);

  const activeCompany = useMemo(
    () => companies.find((company) => company.slug === companySlug) ?? null,
    [companies, companySlug],
  );

  /**
   * Does the user hold this permission AT THE ACTIVE COMPANY?
   *
   * Uses the same resolver the API enforces with, so the UI cannot offer an action the server
   * will reject. Display only — never a substitute for the server check.
   */
  const can = useCallback(
    (permission) => {
      if (!activeCompany) return false;
      return activeCompany.permissions.includes(permission);
    },
    [activeCompany],
  );

  const value = {
    companies,
    activeCompany,
    hasCompanies: companies.length > 0,
    can,
    /** Raw resolver, for checking a membership other than the active one. */
    canForMembership: canDo,
    refresh,
  };

  return <CompanyContext.Provider value={value}>{children}</CompanyContext.Provider>;
}

export function useCompany() {
  const context = useContext(CompanyContext);
  if (!context) throw new Error('useCompany must be used inside CompanyProvider');
  return context;
}
