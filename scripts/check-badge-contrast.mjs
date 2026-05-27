#!/usr/bin/env node
// @ts-check
//
// Validates that all badge color classes in colors.css meet WCAG 2.1 AA
// contrast requirements (4.5:1 for text against background) and reports
// APCA (WCAG 3.0 draft) Lc values as informational warnings.
//
// Usage: node scripts/check-badge-contrast.mjs
//
// Exit codes:
//   0 - all checks pass
//   1 - one or more WCAG AA contrast failures

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

const CSS_PATH = join('apps', 'prairielearn', 'public', 'stylesheets', 'colors.css');

// ---------------------------------------------------------------------------
// Color math
// ---------------------------------------------------------------------------

/** Parse a hex color string like "#ff6c5c" to [r, g, b]. */
function hexToRGB(hex) {
  const h = hex.replace('#', '');
  return [
    Number.parseInt(h.slice(0, 2), 16),
    Number.parseInt(h.slice(2, 4), 16),
    Number.parseInt(h.slice(4, 6), 16),
  ];
}

/** Linearize an sRGB channel (0-255) to [0, 1]. */
function linearize(c) {
  c /= 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** WCAG 2.x relative luminance. */
function luminance(r, g, b) {
  return 0.2126 * linearize(r) + 0.7152 * linearize(g) + 0.0722 * linearize(b);
}

/** WCAG 2.x contrast ratio between two luminance values. */
function wcagContrastRatio(l1, l2) {
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * APCA 0.0.98G-4g lightness contrast (Lc).
 * Reference: https://github.com/Myndex/SAPC-APCA
 * Returns a signed value; positive = dark text on light bg.
 */
function apcaLc(textRGB, bgRGB) {
  function toY(r, g, b) {
    return 0.2126729 * linearize(r) + 0.7151522 * linearize(g) + 0.072175 * linearize(b);
  }

  let txtY = toY(...textRGB);
  let bgY = toY(...bgRGB);

  // Soft clamp near black
  const blkThrs = 0.022;
  const blkClmp = 1.414;
  txtY = txtY > blkThrs ? txtY : txtY + (blkThrs - txtY) ** blkClmp;
  bgY = bgY > blkThrs ? bgY : bgY + (blkThrs - bgY) ** blkClmp;

  // SAPC power-curve constants
  const normBG = 0.56;
  const normTXT = 0.57;
  const revBG = 0.65;
  const revTXT = 0.62;
  const scaleBoW = 1.14;
  const scaleWoB = 1.14;
  const loBoWoffset = 0.027;
  const loWoBoffset = 0.027;
  const loClip = 0.1;

  let SAPC;
  if (bgY > txtY) {
    // Normal polarity: dark text on light bg
    SAPC = (bgY ** normBG - txtY ** normTXT) * scaleBoW;
    return (SAPC < loClip ? 0 : SAPC - loBoWoffset) * 100;
  } else {
    // Reverse polarity: light text on dark bg
    SAPC = (bgY ** revBG - txtY ** revTXT) * scaleWoB;
    return (Math.abs(SAPC) < loClip ? 0 : SAPC + loWoBoffset) * 100;
  }
}

// ---------------------------------------------------------------------------
// CSS parsing
// ---------------------------------------------------------------------------

/**
 * Extract badge color definitions from colors.css.
 * Looks for `.badge.color-<name>` rules and pulls out the `color`,
 * `background-color`, and `border` hex values.
 */
function parseBadgeColors(css) {
  const badges = [];
  // Match .badge.color-<name> { ... } blocks
  const re = /\.badge\.color-([\w-]+)\s*\{([^}]+)\}/g;
  let match;
  while ((match = re.exec(css)) !== null) {
    const name = match[1];
    const body = match[2];

    const colorMatch = body.match(/(?:^|[;\s])color:\s*(#[0-9a-fA-F]{6})/);
    const bgMatch = body.match(/background-color:\s*(#[0-9a-fA-F]{6})/);
    const borderMatch = body.match(/border:\s*1px\s+solid\s+(#[0-9a-fA-F]{6})/);

    if (colorMatch && bgMatch) {
      badges.push({
        name,
        textHex: colorMatch[1],
        bgHex: bgMatch[1],
        borderHex: borderMatch ? borderMatch[1] : null,
      });
    }
  }
  return badges;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

// WCAG 2.1 AA requires 4.5:1 for normal text.
const WCAG_AA_THRESHOLD = 4.5;

// APCA thresholds for ~12px bold text (0.75em * 16px, weight 700).
// Lc 75 is recommended; Lc 60 is the absolute minimum for that size/weight.
// Since APCA/WCAG 3.0 is still a draft, these are informational only.
const APCA_RECOMMENDED = 75;
const APCA_MINIMUM = 60;

const css = await readFile(CSS_PATH, 'utf-8');
const badges = parseBadgeColors(css);

if (badges.length === 0) {
  console.error('Error: no badge color classes found in', CSS_PATH);
  process.exit(1);
}

let hasFailures = false;
const rows = [];

for (const badge of badges) {
  const textRGB = hexToRGB(badge.textHex);
  const bgRGB = hexToRGB(badge.bgHex);

  const textLum = luminance(...textRGB);
  const bgLum = luminance(...bgRGB);
  const wcag = wcagContrastRatio(textLum, bgLum);
  const lc = Math.abs(apcaLc(textRGB, bgRGB));

  const wcagPass = wcag >= WCAG_AA_THRESHOLD;
  const apcaStatus = lc >= APCA_RECOMMENDED ? 'pass' : lc >= APCA_MINIMUM ? 'warn' : 'info';

  if (!wcagPass) hasFailures = true;

  rows.push({
    name: badge.name,
    wcag: wcag.toFixed(2),
    wcagPass,
    lc: lc.toFixed(1),
    apcaStatus,
    textHex: badge.textHex,
    bgHex: badge.bgHex,
  });
}

// Sort by WCAG ratio ascending (worst first)
rows.sort((a, b) => Number.parseFloat(a.wcag) - Number.parseFloat(b.wcag));

// Print results
console.log('Badge contrast check');
console.log('====================\n');
console.log(
  'Name'.padEnd(14),
  'WCAG 2.1'.padEnd(12),
  'APCA Lc'.padEnd(12),
  'Text'.padEnd(10),
  'Background',
);
console.log('-'.repeat(62));

for (const row of rows) {
  const wcagLabel = row.wcagPass ? `${row.wcag}:1` : `${row.wcag}:1 FAIL`;
  const apcaLabel =
    row.apcaStatus === 'pass'
      ? `Lc ${row.lc}`
      : row.apcaStatus === 'warn'
        ? `Lc ${row.lc} *`
        : `Lc ${row.lc} **`;

  console.log(
    row.name.padEnd(14),
    wcagLabel.padEnd(12),
    apcaLabel.padEnd(12),
    row.textHex.padEnd(10),
    row.bgHex,
  );
}

// Summary
console.log();
const wcagFailCount = rows.filter((r) => !r.wcagPass).length;
const apcaWarnCount = rows.filter((r) => r.apcaStatus === 'warn').length;
const apcaInfoCount = rows.filter((r) => r.apcaStatus === 'info').length;

console.log(
  `WCAG 2.1 AA (4.5:1): ${wcagFailCount === 0 ? 'all pass' : `${wcagFailCount} failures`}`,
);
console.log(
  `APCA (informational): ${rows.filter((r) => r.apcaStatus === 'pass').length} pass (Lc >= ${APCA_RECOMMENDED}), ` +
    `${apcaWarnCount} marginal (Lc ${APCA_MINIMUM}-${APCA_RECOMMENDED}), ` +
    `${apcaInfoCount} below minimum (Lc < ${APCA_MINIMUM})`,
);
console.log();
console.log('*  = APCA below recommended Lc for 12px bold text');
console.log('** = APCA below minimum Lc for 12px bold text');

if (hasFailures) {
  console.log('\nFAILED: one or more badge colors do not meet WCAG 2.1 AA contrast requirements.');
  process.exit(1);
}
