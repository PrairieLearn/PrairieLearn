import * as path from 'path';

import fs from 'fs-extra';

import { validateHTML } from '../validateHTML.js';

export interface QuestionContext {
  context: string;
  readme: string | null;
  html: string;
  python: string | null;
}

export async function buildContextForQuestion(dir: string): Promise<QuestionContext | undefined> {
  const readmePath = path.join(dir, 'README.md');
  const hasReadme = await fs.pathExists(readmePath);

  const htmlPath = path.join(dir, 'question.html');
  const html = await fs.readFile(htmlPath, 'utf-8');

  const pythonPath = path.join(dir, 'server.py');
  const hasPython = await fs.pathExists(pythonPath);

  const context: string[] = [];

  const { errors, warnings } = validateHTML(html, hasPython);
  if (errors.length > 0 || warnings.length > 0) {
    return undefined;
  }

  let readme: string | null = null;
  if (hasReadme) {
    readme = await fs.readFile(readmePath, 'utf-8');
    context.push(readme, '\n');
  }

  context.push('```html', html, '```');

  let python: string | null = null;
  if (hasPython) {
    python = await fs.readFile(pythonPath, 'utf-8');
    context.push('\n```python', python, '```');
  }

  return {
    context: context.join('\n'),
    readme,
    html,
    python,
  };
}
