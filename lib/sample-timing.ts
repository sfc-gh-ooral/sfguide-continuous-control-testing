// Sample-mode response time per AI step, in ms. Live calls measured 1–20 s (see README); these sit in
// the 4–8 s range so the staged progress reads like a real interaction.
export const SAMPLE_DELAY_MS = { explain: 5200, classify: 4200, duplicates: 4000, agent: 7600, recount: 1200, runTests: 6400 } as const;
