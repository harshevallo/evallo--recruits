import { useNavigate, useParams } from 'react-router-dom';
import { Button, Container } from '@/components/ui';
import { useAuth } from '@/context/AuthContext';
import { PATHS, buildPath } from '@/router/paths';
import { usePageMeta } from '@/utils/pageMeta';

/**
 * Temporary destination for routes whose feature or content is not built yet.
 *
 * Exists so no link on a shipped page is dead. Each usage names what will replace it.
 *
 * The back action is deliberately contextual. A recruiter who clicks "Open profile" from the
 * interest inbox is deep inside a company; sending them to the marketing home page — as this once
 * did — discards where they were and reads as though something had gone wrong. "Go back" returns
 * them to the screen they came from, and the secondary link lands somewhere useful for whichever
 * context they are in.
 */
export function PlaceholderPage({ title, description, replacedBy }) {
  /*
   * Every placeholder route otherwise inherited the marketing title from `index.html`, so eight
   * distinct pages all read "Evallo Recruit | The Premier Hiring Platform for Educators" in the
   * tab and in a search result. Naming the page is not a claim that its content exists — the body
   * still says what is missing.
   *
   * Set here rather than per route so a future placeholder is titled by existing.
   */
  /*
   * The description mirrors what the page actually says, including that it is not published. The
   * route's own summary alone ("Plans and pricing for education businesses.") would describe a page
   * that does not exist yet, which is the one thing a meta description must not do. The suffix is
   * the same sentence the body already falls back to, not new marketing copy.
   */
  usePageMeta({
    title: `${title} | Evallo Recruit`,
    description: description
      ? `${description} This page is not available yet.`
      : 'This page is not available yet.',
  });

  const navigate = useNavigate();
  const { companySlug } = useParams();
  const { isAuthenticated } = useAuth();

  /*
   * Three contexts, three different "home". Sending a signed-in user to `/` drops them on the
   * marketing site — technically a home page, but not theirs, and it reads as being logged out.
   */
  let fallback = { to: PATHS.HOME, label: 'Back to home' };
  if (companySlug) {
    fallback = { to: buildPath(PATHS.COMPANY_HOME, { companySlug }), label: 'Company home' };
  } else if (isAuthenticated) {
    fallback = { to: PATHS.APP_HOME, label: 'Back to home' };
  }

  return (
    <Container size="prose" className="py-32 text-center">
      <h1 className="text-3xl font-bold tracking-tight text-brand-dark">{title}</h1>

      <p className="mt-4 text-gray-600">{description ?? 'This page is not available yet.'}</p>

      {replacedBy && <p className="mt-2 text-sm text-gray-400">Coming with {replacedBy}.</p>}

      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Button type="button" variant="primary" size="md" onClick={() => navigate(-1)}>
          Go back
        </Button>
        <Button
          to={fallback.to}
          variant="outlineDark"
          size="md"
          className="!border-gray-300 !text-brand-dark hover:!bg-gray-50"
        >
          {fallback.label}
        </Button>
      </div>
    </Container>
  );
}
