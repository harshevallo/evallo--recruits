import { MarketingHero } from '@/features/marketing/components/MarketingHero';
import { BusinessValueSection } from '@/features/marketing/components/BusinessValueSection';
import { EducatorSection } from '@/features/marketing/components/EducatorSection';
import { PlatformFeaturesSection } from '@/features/marketing/components/PlatformFeaturesSection';
import { EarlyAccessSection } from '@/features/marketing/components/EarlyAccessSection';

/**
 * MKT-01 — marketing landing page. The application home page (ADR-015).
 *
 * Composition only: no logic, no data fetching. The one backend interaction on this page lives
 * in EarlyAccessForm's hook.
 */
export function MarketingPage() {
  return (
    <>
      <MarketingHero />
      <BusinessValueSection />
      <EducatorSection />
      <PlatformFeaturesSection />
      <EarlyAccessSection />
    </>
  );
}
