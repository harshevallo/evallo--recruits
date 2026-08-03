import { Button, Container, Icon, Section } from '@/components/ui';
import { MockCandidateCard } from './MockCandidateCard';
import { NumberedStep } from './NumberedStep';

const STEPS = [
  {
    title: 'Create a Static Professional Profile',
    body: 'Showcase your education, experience, and specific subject proficiencies in a format designed specifically for educators.',
  },
  {
    title: 'Verify Your Expertise',
    body: "Take integrated tests on our platform or upload official score reports to earn 'Verified' badges that make you stand out.",
  },
  {
    title: 'Protect Your Privacy',
    body: 'Your profile is kept behind a secure wall, accessible only to vetted business recruiters looking to hire. No public scraping.',
  },
];

export function EducatorSection() {
  return (
    <Section id="educators" tone="white" className="border-t border-gray-100">
      <Container>
        <div className="flex flex-col-reverse items-center gap-16 lg:flex-row">
          <MockCandidateCard />

          <div className="w-full lg:w-1/2">
            <p className="mb-3 text-sm font-semibold uppercase tracking-wide text-brand-blue">
              For Aspiring &amp; Pro Educators
            </p>

            <h2 className="mb-6 text-3xl font-bold text-brand-dark md:text-4xl">
              Build a profile that gets you hired.
            </h2>

            <p className="mb-8 text-lg leading-relaxed text-gray-600">
              Tired of competing in overcrowded marketplaces for low-paying freelance gigs? Evallo
              Recruit connects you with established tutoring companies and schools looking to hire
              for stable part-time and full-time roles.
            </p>

            <ol className="space-y-6">
              {STEPS.map((step, index) => (
                <NumberedStep key={step.title} index={index + 1} title={step.title}>
                  {step.body}
                </NumberedStep>
              ))}
            </ol>

            <div className="mt-10">
              <Button
                href="#get-started"
                variant="link"
                size="none"
                radius="none"
                className="group font-semibold"
              >
                Create Your Educator Profile
                <Icon
                  name="arrow-right"
                  className="transform transition-transform group-hover:translate-x-1"
                />
              </Button>
            </div>
          </div>
        </div>
      </Container>
    </Section>
  );
}
