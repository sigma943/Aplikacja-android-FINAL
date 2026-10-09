// Non-passenger route labels present in the MPK stop catalogue.
// Do not reject letters generally: N1, 0A and 0B are passenger lines.
export function isMpkPassengerLine(line: unknown): boolean {
  const label = String(line ?? '').trim();
  return Boolean(label) && !['doj', 'ptech', 'zj'].includes(label.toLowerCase());
}

export function mpkPassengerStop<T extends { lines: string[] }>(stop: T): T {
  return {...stop, lines: stop.lines.filter(isMpkPassengerLine)};
}
