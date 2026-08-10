import { Button, Icon } from '@/components/ui';
import { PATHS } from '@/router/paths';
import { MockCompanyCard } from './MockCompanyCard';

const BENEFITS = [
  'Public company profile pages',
  'Centralized applicant tracking',
  'Direct in-platform messaging',
];

export function EmployerBrandPanel() {
  return (
    <div className="relative mt-20 overflow-hidden rounded-3xl border border-gray-200 bg-white p-8 shadow-sm md:p-12">
      <div
        aria-hidden="true"
        className="absolute right-0 top-0 -mr-10 -mt-10 h-40 w-40 rounded-full bg-brand-blue/10 blur-3xl"
      />

      <div className="relative z-10 grid grid-cols-1 items-center gap-12 lg:grid-cols-2">
        <div>
          <h3 className="mb-4 text-2xl font-bold text-brand-dark md:text-3xl">
            Establish Your Employer Brand
          </h3>

          <p className="mb-6 text-lg leading-relaxed text-gray-600">
            Create a public-facing company profile on Evallo Recruit. Showcase your company
            culture, list open roles, and let top educators express interest in joining your team
            directly—all indexed for search engines.
          </p>

          <ul className="mb-8 space-y-3">
            {BENEFITS.map((benefit) => (
              <li key={benefit} className="flex items-center text-gray-700">
                <Icon name="circle-check" className="mr-3 text-brand-blue" />
                {benefit}
              </li>
            ))}
          </ul>

          <Button to={PATHS.SIGN_UP} variant="white" size="md">
            Claim Your Company Profile
          </Button>
        </div>

        <MockCompanyCard />
      </div>
    </div>
  );
}
