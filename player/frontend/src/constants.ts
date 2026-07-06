export const DIFFICULTY_OPTIONS = [
  { value: 1, label: "Very easy" },
  { value: 2, label: "Easy" },
  { value: 3, label: "Normal" },
  { value: 4, label: "Hard" },
  { value: 5, label: "Super hard" },
] as const;

export const DIFFICULTY_LABELS: Record<number, string> = Object.fromEntries(
  DIFFICULTY_OPTIONS.map((d) => [d.value, d.label])
);
