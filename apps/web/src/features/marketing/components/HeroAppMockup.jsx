import { Icon } from '@/components/ui';

/**
 * Abstract product screenshot below the hero.
 *
 * Purely decorative — skeleton bars and a fake browser chrome. Marked aria-hidden so screen
 * readers skip it entirely; without that, the placeholder pills ("SAT 1550+", "Verified") are
 * announced as if they were real content.
 */
export function HeroAppMockup() {
  return (
    <div className="relative mx-auto mt-20 max-w-5xl" aria-hidden="true">
      <div className="absolute inset-0 z-10 bg-gradient-to-t from-brand-dark via-transparent to-transparent" />

      <div className="relative overflow-hidden rounded-t-xl border border-b-0 border-gray-800 bg-brand-dark p-4 shadow-2xl">
        {/* Browser chrome */}
        <div className="mb-6 flex items-center gap-2 border-b border-gray-800 pb-4">
          <div className="h-3 w-3 rounded-full bg-gray-700" />
          <div className="h-3 w-3 rounded-full bg-gray-700" />
          <div className="h-3 w-3 rounded-full bg-gray-700" />
        </div>

        <div className="grid grid-cols-1 gap-6 opacity-80 md:grid-cols-3">
          {/* Sidebar */}
          <div className="col-span-1 rounded-lg border border-gray-800 bg-gray-900/50 p-4">
            <div className="mb-4 h-8 w-full rounded bg-gray-800" />
            <div className="mb-2 h-4 w-3/4 rounded bg-gray-800" />
            <div className="mb-6 h-4 w-1/2 rounded bg-gray-800" />
            <div className="space-y-3">
              <div className="h-12 w-full rounded-md bg-gray-800" />
              <div className="h-12 w-full rounded-md bg-gray-800" />
              <div className="h-12 w-full rounded-md border border-brand-blue/30 bg-gray-800" />
            </div>
          </div>

          {/* Detail pane */}
          <div className="col-span-2 rounded-lg border border-gray-800 bg-gray-900/50 p-6">
            <div className="mb-6 flex items-start gap-4">
              <div className="h-16 w-16 flex-shrink-0 rounded-full bg-gray-700" />
              <div>
                <div className="mb-2 h-6 w-48 rounded bg-gray-700" />
                <div className="mb-2 h-4 w-32 rounded bg-gray-800" />
                <div className="flex gap-2">
                  <span className="rounded bg-brand-blue/20 px-2 py-1 text-xs text-brand-blue">
                    SAT 1550+
                  </span>
                  <span className="rounded bg-green-900/40 px-2 py-1 text-xs text-green-400">
                    Verified
                  </span>
                </div>
              </div>
            </div>

            <div className="mb-4 flex h-32 w-full items-center justify-center rounded-lg bg-gray-800">
              <Icon name="circle-play" className="text-4xl text-gray-600" />
            </div>

            <div className="mb-2 h-4 w-full rounded bg-gray-800" />
            <div className="mb-2 h-4 w-full rounded bg-gray-800" />
            <div className="h-4 w-2/3 rounded bg-gray-800" />
          </div>
        </div>
      </div>
    </div>
  );
}
