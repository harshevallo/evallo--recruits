/**
 * Joins class names, dropping falsy values.
 *
 * Keeps conditional Tailwind classes readable without pulling in clsx for one function.
 *
 * @param {...(string|false|null|undefined)} classes
 * @returns {string}
 */
export function cn(...classes) {
  return classes.filter(Boolean).join(' ');
}
