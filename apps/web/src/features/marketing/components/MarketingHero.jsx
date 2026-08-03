import { Button, Container, Icon } from '@/components/ui';
import { PATHS } from '@/router/paths';
import { HeroAppMockup } from './HeroAppMockup';

export function MarketingHero() {
  return (
    <section className="hero-pattern relative overflow-hidden pb-20 pt-32 md:pb-32 md:pt-48">
      <Container className="relative z-10 text-center">
        <p className="mb-8 inline-flex items-center gap-2 rounded-full border border-brand-blue/20 bg-brand-blue/10 px-3 py-1 text-sm font-medium text-brand-blue">
          <span className="relative flex h-2 w-2" aria-hidden="true">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand-blue opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-brand-blue" />
          </span>
          Now accepting pilot partners
        </p>

        <h1 className="mx-auto mb-6 max-w-4xl text-4xl font-extrabold leading-tight tracking-tight text-white md:text-6xl lg:text-7xl">
          The specialized hiring network for{' '}
          <span className="gradient-text">Top Educators</span>
        </h1>

        <p className="mx-auto mb-10 max-w-2xl text-lg text-gray-400 md:text-xl">
          Stop sifting through generic job boards. Connect verified, high-performing tutors with
          premium educational organizations in one specialized platform.
        </p>

        <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
          <Button
            href="#get-started"
            variant="primary"
            size="lg"
            className="w-full sm:w-auto"
          >
            Hire Top Tutors <Icon name="arrow-right" className="text-sm" />
          </Button>

          <Button
            to={PATHS.COMPANY_DIRECTORY}
            variant="outlineDark"
            size="lg"
            className="w-full sm:w-auto"
          >
            Find Teaching Roles
          </Button>
        </div>

        <HeroAppMockup />
      </Container>
    </section>
  );
}
