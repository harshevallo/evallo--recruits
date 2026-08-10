import { Container, Section, SectionHeading } from '@/components/ui';
import { FeatureCard } from './FeatureCard';
import { EmployerBrandPanel } from './EmployerBrandPanel';

const FEATURES = [
  {
    icon: 'certificate',
    title: 'Verified Test Scores',
    body: 'Require candidates to upload official score reports or take adaptive tests (SAT, ACT, etc.) directly on our integrated platform before they can apply.',
  },
  {
    icon: 'video',
    title: 'Video Prompts',
    body: 'Evaluate teaching style instantly. Set specific prompts like "Explain a difficult math concept" and review candidates\' video responses before scheduling an interview.',
  },
  {
    icon: 'filter',
    title: 'Hyper-Targeted Search',
    body: 'Filter talent pools by subject expertise, teaching certifications, standardized test scores, and availability. Find exactly who you need, faster.',
  },
];

export function BusinessValueSection() {
  return (
    <Section id="businesses" tone="white" className="relative">
      <Container>
        <SectionHeading
          eyebrow="For Educational Businesses"
          title="Hire with confidence, not guesswork."
          subtitle="Stop relying on self-reported scores and generic resumes. Evallo Recruit provides the verification and specialized context you need to build a world-class tutoring team."
          className="mb-16 max-w-3xl"
        />

        <div className="grid grid-cols-1 gap-10 md:grid-cols-3">
          {FEATURES.map((feature) => (
            <FeatureCard key={feature.title} icon={feature.icon} title={feature.title}>
              {feature.body}
            </FeatureCard>
          ))}
        </div>

        <EmployerBrandPanel />
      </Container>
    </Section>
  );
}
