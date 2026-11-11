import * as path from 'node:path';

import type { PageCatalog } from '@prairielearn/course-agent-types';

import type { NavPage } from '../../../components/Navbar.types.js';
import { sideNavPagesTabs } from '../../../components/SideNav.js';
import type { Assessment, Course, CourseInstance, Question } from '../../../lib/db-types.js';
import { getNavPageTabs } from '../../../lib/navPageTabs.js';
import type { UntypedResLocals } from '../../../lib/res-locals.types.js';
import { encodePath } from '../../../lib/uri-util.js';

type PageParam = PageCatalog[number]['params'][number];

/**
 * The instructor navigation groups the agent can open, with the names each group's pages need.
 * A group missing from here (public, administrator, institution) is not offered to the agent.
 */
const GROUP_PARAMS = {
  course_admin: [],
  instance_admin: ['courseInstance'],
  students: ['courseInstance'],
  assessment: ['courseInstance', 'assessment'],
  question: ['question'],
} satisfies Partial<Record<Exclude<NavPage, undefined>, PageParam[]>>;

type Group = keyof typeof GROUP_PARAMS;

interface AgentPage {
  group: Group;
  entry: PageCatalog[number];
  urlSuffix: string | ((resLocals: UntypedResLocals) => string);
}

/**
 * Every tab of the instructor navigation, keyed like the page location (`navPage.subPage`), so
 * a page added to the navigation becomes one the agent can open. The side nav comes first, so
 * its labels win where a page is also the first tab of its group ("Course settings" over "General").
 */
function agentPages() {
  const navPageTabs = getNavPageTabs();
  const tabs = [
    ...Object.values(sideNavPagesTabs)
      .flat()
      .map((tab) => ({
        group: tab.activePages[0] as Group,
        subPages: tab.activeSubPages,
        label: tab.tabLabel,
        urlSuffix: tab.urlSuffix,
      })),
    ...(Object.keys(GROUP_PARAMS) as Group[]).flatMap((group) =>
      navPageTabs[group].map((tab) => ({
        group,
        subPages: [tab.activeSubPage].flat(),
        // Labels that depend on the request fall back to their plain form.
        label: typeof tab.tabLabel === 'function' ? tab.tabLabel({}) : tab.tabLabel,
        urlSuffix: tab.urlSuffix,
      })),
    ),
  ];
  const pages = new Map<string, AgentPage>();
  for (const tab of tabs) {
    const key = `${tab.group}.${tab.subPages[0]}`;
    if (pages.has(key)) continue;
    pages.set(key, {
      group: tab.group,
      entry: {
        key,
        label: tab.label,
        params: GROUP_PARAMS[tab.group],
        file: tab.subPages.includes('file_view'),
      },
      urlSuffix: tab.urlSuffix,
    });
  }
  return pages;
}

export function buildPageCatalog(): PageCatalog {
  return [...agentPages().values()].map((page) => page.entry);
}

export function findAgentPage(key: string) {
  return agentPages().get(key)?.entry;
}

interface PageRows {
  course: Pick<Course, 'id'>;
  course_instance: Pick<CourseInstance, 'id' | 'short_name'> | null;
  assessment: Pick<Assessment, 'id' | 'tid'> | null;
  question: Pick<Question, 'id' | 'qid'> | null;
}

/**
 * Each file browser shows only its own directory and rejects paths outside it, so a `file` is a
 * path inside the directory its page belongs to.
 */
const FILE_ROOTS: Record<Group, (rows: PageRows) => string> = {
  course_admin: () => '',
  instance_admin: ({ course_instance }) => `courseInstances/${course_instance?.short_name}`,
  students: ({ course_instance }) => `courseInstances/${course_instance?.short_name}`,
  assessment: ({ course_instance, assessment }) =>
    `courseInstances/${course_instance?.short_name}/assessments/${assessment?.tid}`,
  question: ({ question }) => `questions/${question?.qid}`,
};

/** The URL of a catalog page, built by the same function that builds its navigation link. */
export function agentPageUrl({
  key,
  file,
  ...rows
}: PageRows & { key: string; file: string | null }) {
  const page = agentPages().get(key);
  if (!page) throw new Error(`Unknown course agent page: ${key}`);
  const urlPrefix = rows.course_instance
    ? `/pl/course_instance/${rows.course_instance.id}/instructor`
    : `/pl/course/${rows.course.id}`;
  const urlSuffix =
    typeof page.urlSuffix === 'function' ? page.urlSuffix({ ...rows, urlPrefix }) : page.urlSuffix;
  const filePath =
    page.entry.file && file ? `/${encodePath(path.join(FILE_ROOTS[page.group](rows), file))}` : '';
  return `${urlPrefix}${urlSuffix}${filePath}`;
}
