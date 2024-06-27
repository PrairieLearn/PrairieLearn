import * as path from 'path';

import fs from 'fs-extra';

export async function buildContextForQuestion(dir: string): Promise<string> {
  const readmePath = path.join(dir, 'README.md');
  const hasReadme = await fs.pathExists(readmePath);
  const readme = hasReadme ? await fs.readFile(readmePath, 'utf-8') : '';

  const htmlPath = path.join(dir, 'question.html');
  const html = await fs.readFile(htmlPath, 'utf-8');

  const pythonPath = path.join(dir, 'server.py');
  const hasPython = await fs.pathExists(pythonPath);
  const python = hasPython ? await fs.readFile(pythonPath, 'utf-8') : '';

  const context: string[] = [];

  if (hasReadme) {
    context.push(readme, '\n');
  }

  context.push('```html', html, '```');

  if (hasPython) {
    context.push('\n```python', python, '```');
  }

  return context.join('\n');
}
