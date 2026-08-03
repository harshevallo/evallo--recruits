import { Button, Container } from '@/components/ui';
import { PATHS } from '@/router/paths';

/**
 * Temporary destination for routes whose feature or content is not built yet.
 *
 * Exists so no link on a shipped page is dead. Each usage names what will replace it.
 */
export function PlaceholderPage({ title, description, replacedBy }) {
  return (
    <Container size="prose" className="py-32 text-center">
      <h1 className="text-3xl font-bold tracking-tight text-brand-dark">{title}</h1>

      <p className="mt-4 text-gray-600">
        {description ?? 'This page is not available yet.'}
      </p>

      {replacedBy && (
        <p className="mt-2 text-sm text-gray-400">Coming with {replacedBy}.</p>
      )}

      <Button to={PATHS.HOME} variant="primary" size="md" className="mt-8">
        Back to home
      </Button>
    </Container>
  );
}
