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
 * These are EVALLO's accounts, not Evallo Recruit's own — the labels say so, because an accessible
 * name that promises a product-specific feed the link does not lead to is a small lie told to
 * exactly the people who cannot see where they are going.
 *
 * The Instagram URL is deliberately stored WITHOUT the `?igsh=…` parameter it was copied with.
 * That is a share-attribution token generated for one share event, not part of the profile
 * address; it adds nothing for a visitor and hands Instagram a referral identifier on every
 * footer render.
 *
 * Every entry links somewhere real. A network Evallo has no account on is left OFF this list
 * rather than rendered as a greyed-out placeholder, so nothing here promises a feed that does not
 * exist. Add the entry when the account does.
 */
const SOCIAL_LINKS = [
  {
    icon: 'linkedin',
    label: 'Evallo on LinkedIn',
    url: 'https://www.linkedin.com/company/evallo-digital-products/',
  },
  {
    icon: 'instagram',
    label: 'Evallo on Instagram',
    url: 'https://www.instagram.com/evallo.official',
  },
  {
    icon: 'facebook',
    label: 'Evallo on Facebook',
    url: 'https://www.facebook.com/app.evallo.org/',
  },
];

/*
 * White footer — one base colour with the rest of the surface.
 *
 * Every token below is a light-theme value, so the dark theme becomes a `dark:` pass over these same
 * tokens rather than a second footer to keep in sync.
 */
/**
 * PUBLIC pages only.
 *
 * There used to be a `minimal` variant — identity, legal and copyright — for the signed-in
 * workspace, on the reasoning that the full link columns duplicated the rail. The conclusion has
 * moved one step further: the workspace wants no footer at all, so `MarketingLayout` simply does
 * not render one there (`footer={false}`). Keeping a variant nothing renders would be a second
 * footer to maintain for no surface.
 */
export function MarketingFooter() {
  return (
    <footer className="border-t border-gray-200 bg-white pb-8 pt-16">
      <Container>
        <div className="mb-12 grid grid-cols-1 gap-12 md:grid-cols-4">
          <div className="col-span-1 md:col-span-1">
            <Logo size="sm" tone="dark" className="mb-4" />

            <p className="mb-6 text-sm leading-relaxed text-gray-600">
              Bridging the gap between premium educational organizations and vetted, high-quality
              teaching talent.
            </p>

            <ul className="flex space-x-4">
              {SOCIAL_LINKS.map((social) => (
                <li key={social.icon}>
                  <a
                    href={social.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-gray-500 transition-colors hover:text-brand-dark"
                  >
                    <Icon name={social.icon} label={social.label} />
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {FOOTER_COLUMNS.map((column) => (
            <div key={column.heading}>
              <h2 className="mb-4 font-semibold text-brand-dark">{column.heading}</h2>
              <ul className="space-y-2 text-sm text-gray-600">
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

        <div className="flex flex-col items-center justify-between border-t border-gray-200 pt-8 md:flex-row">
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
