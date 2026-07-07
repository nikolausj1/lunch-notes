const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS_FULL = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export function parseISO(date: string): { y: number; m: number; d: number } {
  const [y, m, d] = date.split("-").map(Number);
  return { y, m: m - 1, d };
}

/** "Dec 10" */
export function formatShort(date: string): string {
  const { m, d } = parseISO(date);
  return `${MONTHS[m]} ${d}`;
}

/** "December 10, 2025" */
export function formatLong(date: string): string {
  const { y, m, d } = parseISO(date);
  return `${MONTHS_FULL[m]} ${d}, ${y}`;
}

/** "December 2025" — used for timeline month markers */
export function formatMonth(date: string): string {
  const { y, m } = parseISO(date);
  return `${MONTHS_FULL[m]} ${y}`;
}

export function monthKey(date: string): string {
  return date.slice(0, 7);
}
