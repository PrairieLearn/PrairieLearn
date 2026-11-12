import * as path from 'node:path';

import type { NavigationTarget, PageCatalog } from '@prairielearn/course-agent-types';
import { HttpStatusError } from '@prairielearn/error';

import type { NavPage } from '../../../components/Navbar.types.js';
import { sideNavPagesTabs } from '../../../components/SideNav.js';
import type { Assessment, Course, CourseInstance, Question } from '../../../lib/db-types.js';
import { getNavPageTabs } from '../../../lib/navPageTabs.js';
import type { UntypedResLocals } from '../../../lib/res-locals.types.js';
import { encodePath } from '../../../lib/uri-util.js';
import { selectOptionalAssessmentByTid } from '../../../models/assessment.js';
import { selectOptionalCourseInstanceByShortName } from '../../../models/course-instances.js';
import { selectOptionalQuestionByQid } from '../../../models/question.js';

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

/** Builds a page's URL with the same function that builds its navigation link. */
function pageUrl(page: AgentPage, file: string | undefined, rows: PageRows) {
  const urlPrefix = rows.course_instance
    ? `/pl/course_instance/${rows.course_instance.id}/instructor`
    : `/pl/course/${rows.course.id}`;
  const urlSuffix =
    typeof page.urlSuffix === 'function' ? page.urlSuffix({ ...rows, urlPrefix }) : page.urlSuffix;
  const filePath =
    page.entry.file && file ? `/${encodePath(path.join(FILE_ROOTS[page.group](rows), file))}` : '';
  return `${urlPrefix}${urlSuffix}${filePath}`;
}

/**
 * The URL of the page the agent named, with its names resolved the way course files name things.
 * The messages tell the agent what to correct.
 */
export async function resolveAgentPageUrl(course: Pick<Course, 'id'>, target: NavigationTarget) {
  const page = agentPages().get(target.page);
  if (!page) throw new HttpStatusError(404, `No page named "${target.page}".`);
  const { params } = page.entry;
  const missing = params.filter((param) => !target[param]);
  if (missing.length > 0) {
    throw new HttpStatusError(400, `Page "${target.page}" also needs: ${missing.join(', ')}.`);
  }

  const course_instance = target.courseInstance
    ? await selectOptionalCourseInstanceByShortName({ course, shortName: target.courseInstance })
    : null;
  if (target.courseInstance && !course_instance) {
    throw new HttpStatusError(404, `No course instance named "${target.courseInstance}".`);
  }
  // Names a page does not use are ignored, so only its own params are looked up.
  const assessment =
    params.includes('assessment') && course_instance
      ? await selectOptionalAssessmentByTid({
          course_instance_id: course_instance.id,
          tid: target.assessment!,
        })
      : null;
  if (params.includes('assessment') && !assessment) {
    throw new HttpStatusError(404, `No assessment named "${target.assessment}".`);
  }
  const question = params.includes('question')
    ? await selectOptionalQuestionByQid({ qid: target.question!, course_id: course.id })
    : null;
  if (params.includes('question') && !question) {
    throw new HttpStatusError(404, `No question named "${target.question}".`);
  }
  return pageUrl(page, target.file, { course, course_instance, assessment, question });
}
