import * as path from 'path';

import fs from 'fs-extra';

import { validateHTML } from '../validateHTML.js';

export async function buildContextForQuestion(dir: string): Promise<string | undefined> {
  const readmePath = path.join(dir, 'README.md');
  const hasReadme = await fs.pathExists(readmePath);

  const htmlPath = path.join(dir, 'question.html');
  const html = await fs.readFile(htmlPath, 'utf-8');

  const pythonPath = path.join(dir, 'server.py');
  const hasPython = await fs.pathExists(pythonPath);

  const context: string[] = [];

  if (validateHTML(html, hasPython).length > 0) {
    return undefined;
  }

  if (hasReadme) {
    const readme = await fs.readFile(readmePath, 'utf-8');
    context.push(readme, '\n');
  }

  context.push('```html', html, '```');

  if (hasPython) {
    const python = await fs.readFile(pythonPath, 'utf-8');
    context.push('\n```python', python, '```');
  }

  return context.join('\n');
}
