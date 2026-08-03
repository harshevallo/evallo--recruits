import { Link } from 'react-router-dom';
import { Container, Icon, Logo } from '@/components/ui';
import { PATHS } from '@/router/paths';

const FOOTER_COLUMNS = [
  {
    heading: 'Platform',
    links: [
      { label: 'For Businesses', to: `${PATHS.HOME}#businesses` },
      { label: 'For Educators', to: `${PATHS.HOME}#educators` },
      { label: 'Assessment Engine', to: PATHS.ASSESSMENTS },
      { label: 'Pricing', to: PATHS.PRICING },
    ],
  },
  {
    heading: 'Resources',
    links: [
      { label: 'Help Center', to: PATHS.HELP },
      { label: 'Hiring Guides', to: PATHS.GUIDES },
      { label: 'Blog', to: PATHS.BLOG },
      { label: 'Market Research', to: PATHS.RESEARCH },
    ],
  },
  {
    heading: 'Company',
    links: [
      { label: 'About Us', to: PATHS.ABOUT },
      { label: 'Contact', to: PATHS.CONTACT },
      { label: 'Privacy Policy', to: PATHS.PRIVACY },
      { label: 'Terms of Service', to: PATHS.TERMS },
    ],
  },
];

/**
 * Social profile URLs are external and not yet available.
 * Replace `url` with the real profile when the accounts exist.
 */
const SOCIAL_LINKS = [
  { icon: 'twitter', label: 'Evallo Recruit on Twitter', url: null },
  { icon: 'linkedin', label: 'Evallo Recruit on LinkedIn', url: null },
  { icon: 'facebook', label: 'Evallo Recruit on Facebook', url: null },
];

export function MarketingFooter() {
  return (
    <footer className="border-t border-gray-800 bg-brand-dark pb-8 pt-16">
      <Container>
        <div className="mb-12 grid grid-cols-1 gap-12 md:grid-cols-4">
          <div className="col-span-1 md:col-span-1">
            <Logo size="sm" tone="light" className="mb-4" />

            <p className="mb-6 text-sm leading-relaxed text-gray-400">
              Bridging the gap between premium educational organizations and vetted, high-quality
              teaching talent.
            </p>

            <ul className="flex space-x-4">
              {SOCIAL_LINKS.map((social) =>
                social.url ? (
                  <li key={social.icon}>
                    <a
                      href={social.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-gray-400 transition-colors hover:text-white"
                    >
                      <Icon name={social.icon} label={social.label} />
                    </a>
                  </li>
                ) : (
                  // Rendered non-interactive rather than as a dead link.
                  <li key={social.icon} className="text-gray-600" title="Coming soon">
                    <Icon name={social.icon} label={`${social.label} — coming soon`} />
                  </li>
                ),
              )}
            </ul>
          </div>

          {FOOTER_COLUMNS.map((column) => (
            <div key={column.heading}>
              <h2 className="mb-4 font-semibold text-white">{column.heading}</h2>
              <ul className="space-y-2 text-sm text-gray-400">
                {column.links.map((link) => (
                  <li key={link.label}>
                    <Link to={link.to} className="transition-colors hover:text-brand-blue">
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="flex flex-col items-center justify-between border-t border-gray-800 pt-8 md:flex-row">
          <p className="text-sm text-gray-500">&copy; 2026 Evallo. All rights reserved.</p>

          <div className="mt-4 md:mt-0">
            <span className="flex items-center gap-2 text-sm text-gray-500">
              Built with <Icon name="heart" className="text-red-500" /> for the Education Sector
            </span>
          </div>
        </div>
      </Container>
    </footer>
  );
}
