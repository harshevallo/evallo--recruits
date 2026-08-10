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

        <h1 className="mx-auto mb-6 max-w-4xl text-4xl font-extrabold leading-tight tracking-tight text-brand-dark md:text-6xl lg:text-7xl">
          The specialized hiring network for{' '}
          <span className="gradient-text">Top Educators</span>
        </h1>

        <p className="mx-auto mb-10 max-w-2xl text-lg text-gray-600 md:text-xl">
          Stop sifting through generic job boards. Connect verified, high-performing tutors with
          premium educational organizations in one specialized platform.
        </p>

        {/*
          Candidate-first. The educator is the primary acquisition flow, so "Apply for roles" is the
          primary action and hiring is deliberately the secondary one — a marketplace with no
          supply of educators has nothing for a recruiter to buy.

          "Apply for roles" points at sign-up rather than the directory: applying requires an
          account, and the interest flow (CAN-07) needs a candidate profile to share. Sending an
          anonymous visitor to a browse page would defer the decision we are asking them to make.
        */}
        <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
          <Button to={PATHS.SIGN_UP} variant="primary" size="lg" className="w-full sm:w-auto">
            Apply for roles <Icon name="arrow-right" className="text-sm" />
          </Button>

          {/*
            `outlineDark` is white-on-transparent, built for the old dark hero — on the light hero it
            rendered white text on white. This is the light-ground outline instead.
          */}
          <Button
            to={PATHS.COMPANY_START}
            variant="outlineDark"
            size="lg"
            className="w-full !border-gray-300 !bg-white !text-brand-dark hover:!bg-gray-50 sm:w-auto"
          >
            Post a job
          </Button>
        </div>

        {/* Browsing without committing stays available, just not as a primary action. */}
        <p className="mt-5 text-sm text-gray-600">
          Or{' '}
          <a
            href={PATHS.COMPANY_DIRECTORY}
            className="font-semibold text-brand-blue underline decoration-brand-blue/30 underline-offset-4 transition-colors hover:decoration-brand-blue"
          >
            browse education companies
          </a>{' '}
          first.
        </p>

        <HeroAppMockup />
      </Container>
    </section>
  );
}
