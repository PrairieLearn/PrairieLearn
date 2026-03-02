/**
 * Maps PrairieLearn color names to subtle (pastel background + dark text) variants
 * for use in compact views like the assessment structure tree.
 *
 * Each shade within a family (1=lightest, 2=medium, 3=darkest) gets a distinct
 * subtle treatment so they remain visually distinguishable.
 */
const subtleColorMap: Record<string, { bg: string; text: string }> = {
  // Red
  red1: { bg: '#fff1ed', text: '#8b3a2a' },
  red2: { bg: '#ffe8e5', text: '#a02010' },
  red3: { bg: '#fde0dc', text: '#7a1a0e' },
  // Pink
  pink1: { bg: '#fff0f6', text: '#8a3060' },
  pink2: { bg: '#ffe5ef', text: '#7a1850' },
  pink3: { bg: '#fcdce9', text: '#5e0e30' },
  // Purple
  purple1: { bg: '#f5edf7', text: '#6a3580' },
  purple2: { bg: '#f0e4f5', text: '#582a70' },
  purple3: { bg: '#ebdcf2', text: '#3e0c55' },
  // Blue
  blue1: { bg: '#e8f6fd', text: '#0070a8' },
  blue2: { bg: '#e0f0fc', text: '#005a90' },
  blue3: { bg: '#dceaf8', text: '#003a6e' },
  // Turquoise
  turquoise1: { bg: '#e6faf9', text: '#007a72' },
  turquoise2: { bg: '#dff6f4', text: '#006058' },
  turquoise3: { bg: '#d8f2f0', text: '#004a44' },
  // Green
  green1: { bg: '#e8faf0', text: '#007830' },
  green2: { bg: '#e0f6ea', text: '#006025' },
  green3: { bg: '#d8f2e2', text: '#00501c' },
  // Yellow
  yellow1: { bg: '#fef8e8', text: '#7a5200' },
  yellow2: { bg: '#fdf2dc', text: '#6b4400' },
  yellow3: { bg: '#fbedd2', text: '#5a3600' },
  // Orange
  orange1: { bg: '#fff4ec', text: '#8a4020' },
  orange2: { bg: '#ffede5', text: '#7a3018' },
  orange3: { bg: '#fce6de', text: '#602010' },
  // Brown
  brown1: { bg: '#f9f1eb', text: '#6d452c' },
  brown2: { bg: '#f5ebe2', text: '#5a3820' },
  brown3: { bg: '#f0e5dc', text: '#4a2c18' },
  // Gray
  gray1: { bg: '#f5f5f5', text: '#4a4a4a' },
  gray2: { bg: '#efefef', text: '#3a3a3a' },
  gray3: { bg: '#eaeaea', text: '#2d2d2d' },
};

const defaultSubtle = { bg: '#f2f2f2', text: '#3d3d3d' };

export function getSubtleColor(color: string): { bg: string; text: string } {
  return subtleColorMap[color] ?? defaultSubtle;
}

export function SubtleBadge({ color, label }: { color: string; label: string }) {
  const { bg, text } = getSubtleColor(color);
  return (
    <span
      className="badge"
      style={{ backgroundColor: bg, color: text, fontWeight: 600 }}
    >
      {label}
    </span>
  );
}
