import { Container, Section } from '@/components/ui';
import { EarlyAccessForm } from './EarlyAccessForm';

export function EarlyAccessSection() {
  return (
    <Section id="get-started" tone="brand" className="relative overflow-hidden">
      {/* Background decorations */}
      <div aria-hidden="true" className="absolute left-0 top-0 z-0 h-full w-full overflow-hidden">
        <div className="absolute -left-24 -top-24 h-96 w-96 rounded-full bg-white opacity-10 blur-3xl" />
        <div className="absolute -bottom-24 -right-24 h-96 w-96 rounded-full bg-black opacity-10 blur-3xl" />
      </div>

      <Container size="narrow" className="relative z-10 text-center text-white">
        <h2 className="mb-6 text-4xl font-bold md:text-5xl">Join the Evallo Recruit Pilot</h2>

        <p className="mx-auto mb-10 max-w-2xl text-xl text-blue-100">
          We are currently onboarding a select group of tutoring businesses and high-caliber
          educators for our early access program.
        </p>

        <EarlyAccessForm />
      </Container>
    </Section>
  );
}
