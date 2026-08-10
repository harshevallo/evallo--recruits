import { Avatar, Badge, Icon } from '@/components/ui';

/**
 * Illustrative educator profile card in the educators section.
 *
 * Decorative and aria-hidden. The person and credentials are examples, not a real user.
 */
export function MockCandidateCard() {
  return (
    <div className="relative w-full overflow-x-clip lg:w-1/2" aria-hidden="true">
      {/*
        `overflow-x-clip` on the wrapper contains the tilted backdrop below: `scale-105` with
        `-rotate-3` pushes it about 8px past this card, which was enough to give the whole landing
        page a horizontal scrollbar at 375px. Clip rather than hidden — clip does not create a
        scroll container, so it cannot interfere with sticky or absolute descendants.
      */}
      <div className="absolute inset-0 -z-10 -rotate-3 scale-105 transform rounded-3xl bg-brand-light" />

      <div className="relative z-10 rounded-3xl border border-gray-100 bg-white p-8 shadow-xl">
        <div className="mb-6 flex items-center justify-between border-b border-gray-100 pb-6">
          <div className="flex items-center gap-4">
            <Avatar initials="PT" size="lg" tone="neutral" className="border-2 border-white shadow-sm" />
            <div>
              <p className="text-xl font-bold text-brand-dark">Sarah Jenkins</p>
              <p className="text-sm text-gray-600">Expert Math &amp; Science Educator</p>
            </div>
          </div>

          <Badge tone="successLight" size="sm" radius="full" weight="bold">
            <Icon name="shield-halved" /> Verified
          </Badge>
        </div>

        <div className="mb-6">
          <p className="mb-3 text-xs font-bold uppercase tracking-wider text-gray-600">
            Verified Credentials
          </p>
          <div className="flex flex-wrap gap-2">
            <Badge tone="neutral" size="lg" radius="md">
              <Icon name="star" className="text-sm text-yellow-400" />
              <span className="text-sm font-medium text-brand-dark">SAT Math: 800</span>
            </Badge>
            <Badge tone="neutral" size="lg" radius="md">
              <Icon name="award" className="text-sm text-brand-blue" />
              <span className="text-sm font-medium text-brand-dark">State Teaching Cert</span>
            </Badge>
          </div>
        </div>

        <div>
          <p className="mb-3 text-xs font-bold uppercase tracking-wider text-gray-600">
            Teaching Sample
          </p>
          {/* A video frame is legitimately dark — its own text stays light for that reason. */}
          <div className="group relative flex h-40 cursor-pointer items-center justify-center overflow-hidden rounded-xl bg-gray-900">
            <div className="absolute inset-0 bg-black/20 transition-colors group-hover:bg-black/10" />
            <Icon
              name="play"
              className="text-3xl text-white opacity-90 transition-all group-hover:scale-110 group-hover:opacity-100"
            />
            <span className="absolute bottom-3 left-4 text-xs font-medium text-white">
              &quot;Explaining Polynomials&quot;
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
