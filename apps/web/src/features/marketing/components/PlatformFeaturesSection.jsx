import { Container, Section } from '@/components/ui';
import { FeatureCard } from './FeatureCard';

const CARDS = [
  {
    icon: 'laptop-code',
    title: 'Native Assessments',
    body: 'Utilize our built-in digital testing interface (including digital SAT/ACT formats) to test candidates’ subject knowledge.',
  },
  {
    icon: 'file-shield',
    title: 'Document Verification',
    body: 'Securely request and view teaching certificates, transcripts, and official score reports directly within candidate profiles.',
  },
  {
    icon: 'comments',
    title: 'In-Platform Comms',
    body: 'Message candidates, schedule interviews, and manage the entire communication flow without sharing personal emails initially.',
  },
  {
    icon: 'layer-group',
    title: 'Portfolio Showcase',
    body: 'Educators can build rich portfolios including video teaching samples, past student reviews, and specific methodology approaches.',
  },
];

export function PlatformFeaturesSection() {
  return (
    <Section id="features" tone="white">
      <Container>
        <div className="mb-16 text-center">
          <h2 className="mb-4 text-3xl font-bold md:text-4xl">
            A recruitment cycle optimized for education
          </h2>
          <p className="mx-auto max-w-2xl text-gray-600">
            Everything you need to evaluate instructional talent natively built into one secure
            platform.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-4">
          {CARDS.map((card) => (
            <FeatureCard key={card.title} icon={card.icon} title={card.title} tone="white">
              {card.body}
            </FeatureCard>
          ))}
        </div>
      </Container>
    </Section>
  );
}
