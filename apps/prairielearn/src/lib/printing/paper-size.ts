export const PAPER_SIZES = ['Letter', 'A4'] as const;
export type PaperSize = (typeof PAPER_SIZES)[number];

export const PAPER_DIMENSIONS = {
  Letter: { width: '8.5in', height: '11in' },
  A4: { width: '210mm', height: '297mm' },
} satisfies Record<PaperSize, { width: string; height: string }>;
