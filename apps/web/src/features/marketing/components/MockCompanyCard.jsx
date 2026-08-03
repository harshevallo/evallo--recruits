import { Avatar, Badge } from '@/components/ui';

/**
 * Illustrative company profile card inside the employer-brand panel.
 *
 * Decorative and aria-hidden. The organisation and role names are examples, not real customers.
 */
const OPEN_ROLES = [
  { title: 'Senior SAT Math Tutor', meta: 'Full-time • Remote' },
  { title: 'AP Physics Instructor', meta: 'Part-time • Chicago, IL' },
];

export function MockCompanyCard() {
  return (
    <div
      aria-hidden="true"
      className="rotate-2 transform rounded-xl border border-gray-800 bg-gray-900 p-6 shadow-lg transition-transform duration-300 hover:rotate-0"
    >
      <div className="mb-6 flex items-center gap-4">
        <Avatar initials="SL" size="lg" shape="rounded" tone="brand" className="shadow-inner" />
        <div>
          <p className="text-xl font-bold text-white">Seven Square Learning</p>
          <p className="text-sm text-gray-400">Test Prep &amp; Academic Tutoring</p>
        </div>
      </div>

      <div className="space-y-4">
        {OPEN_ROLES.map((role) => (
          <div
            key={role.title}
            className="flex items-center justify-between rounded-lg bg-gray-800 p-4"
          >
            <div>
              <p className="font-medium text-white">{role.title}</p>
              <p className="mt-1 text-xs text-gray-500">{role.meta}</p>
            </div>
            <Badge tone="brand" size="sm">
              Hiring
            </Badge>
          </div>
        ))}
      </div>
    </div>
  );
}
