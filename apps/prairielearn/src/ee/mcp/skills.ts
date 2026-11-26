import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import type { SkillCatalog } from '@modelcontextprotocol/server/ext/skills';
import { loadSkills } from '@modelcontextprotocol/server/ext/skills/node';

import { logger } from '@prairielearn/logger';

import { REPOSITORY_ROOT_PATH } from '../../lib/paths.js';

/**
 * The course agent's skills, which its sandbox image also copies. Serving them from here means a
 * connected agent always gets the skills that match this PrairieLearn version.
 */
const SKILLS_ROOT = path.join(REPOSITORY_ROOT_PATH, 'apps/course-agent/container/skills');

let skillCatalog: Promise<SkillCatalog> | undefined;

/**
 * The skills as the MCP skills extension serves them, at `skill://prairielearn/<name>/SKILL.md`.
 * An agent checks each file against the digest computed here, and the files only change with a
 * deploy, so they are read once.
 */
export async function getSkillCatalog() {
  skillCatalog ??= loadSkills(SKILLS_ROOT, {
    prefix: 'prairielearn',
    onWarning: (warning) => logger.warn('MCP skill not served as published', warning),
  });
  return await skillCatalog;
}

interface SkillSummary {
  name: string;
  description: string;
}

/** `name` and `description` from the YAML block that starts a SKILL.md. Both are single lines. */
function parseFrontmatter(markdown: string) {
  const block = /^---\n([\s\S]*?)\n---/.exec(markdown)?.[1] ?? '';
  const field = (key: string) =>
    new RegExp(`^${key}:\\s*(.*)$`, 'm')
      .exec(block)?.[1]
      .replace(/^["']|["']$/g, '')
      .trim();
  return { name: field('name'), description: field('description') };
}

export async function listSkills(): Promise<SkillSummary[]> {
  const entries = await fs.readdir(SKILLS_ROOT, { withFileTypes: true });
  const skills = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory())
      .map(async (entry) => {
        const markdown = await fs
          .readFile(path.join(SKILLS_ROOT, entry.name, 'SKILL.md'), 'utf8')
          .catch(() => null);
        if (markdown === null) return null;
        const { description } = parseFrontmatter(markdown);
        // A skill is addressed by its directory, which its `name` matches by convention.
        return { name: entry.name, description: description ?? '' };
      }),
  );
  return skills.filter((skill) => skill !== null).sort((a, b) => a.name.localeCompare(b.name));
}

/** Every file in a skill, as paths relative to the skill's directory. */
async function listSkillFiles(name: string) {
  const entries = await fs.readdir(path.join(SKILLS_ROOT, name), {
    recursive: true,
    withFileTypes: true,
  });
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) =>
      path
        .relative(path.join(SKILLS_ROOT, name), path.join(entry.parentPath, entry.name))
        .split(path.sep)
        .join('/'),
    )
    .sort();
}

/**
 * One file of a skill, or null if the skill or file does not exist. Only files found by listing
 * the skill's directory are served, so a path cannot reach outside it.
 */
export async function readSkillFile(
  name: string,
  filePath = 'SKILL.md',
): Promise<{ text: string; files: string[] } | null> {
  const skills = await listSkills();
  if (!skills.some((skill) => skill.name === name)) return null;
  const files = await listSkillFiles(name);
  if (!files.includes(filePath)) return null;
  const text = await fs.readFile(path.join(SKILLS_ROOT, name, ...filePath.split('/')), 'utf8');
  return { text, files };
}
