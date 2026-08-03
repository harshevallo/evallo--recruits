/**
 * A numbered step in the educators list.
 *
 * Rendered as a list item so the sequence is conveyed structurally, not only visually. The
 * circled index is aria-hidden because the list already communicates order.
 */
export function NumberedStep({ index, title, children }) {
  return (
    <li className="flex items-start">
      <div
        aria-hidden="true"
        className="mt-1 flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-blue-50 text-brand-blue"
      >
        {index}
      </div>
      <div className="ml-4">
        <h3 className="text-lg font-bold text-brand-dark">{title}</h3>
        <p className="mt-1 text-gray-500">{children}</p>
      </div>
    </li>
  );
}
