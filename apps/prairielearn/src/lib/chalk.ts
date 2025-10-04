import { AnsiUp } from 'ansi_up';
import { Chalk } from 'chalk';

export const chalk = new Chalk({ level: 3 });

const ansiUp = new AnsiUp();
// Set a custom style for faint text that allows it to be hidden. This only
// affects pages that set `--verbose-display` to a specific value, pages that
// don't set this variable will not be affected and will use the default CSS
// display value.
ansiUp.faintStyle = 'opacity: 0.7; display: var(--verbose-display);';

export function ansiToHtml(ansiString: string | null): string {
  const htmlString = ansiUp.ansi_to_html(ansiString ?? '');
  // We want to be able to hide whole lines of output, so we need to ensure the line breaks are inside spans.
  return htmlString.replaceAll('</span>\n', '\n</span>');
}
