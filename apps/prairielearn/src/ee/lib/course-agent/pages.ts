import type { PageCatalog } from '@prairielearn/course-agent-types';

import type { NavPage } from '../../../components/Navbar.types.js';
import { sideNavPagesTabs } from '../../../components/SideNav.js';
import type { Assessment, Course, CourseInstance, Question } from '../../../lib/db-types.js';
import { getNavPageTabs } from '../../../lib/navPageTabs.js';
import type { UntypedResLocals } from '../../../lib/res-locals.types.js';

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

/** The course and the course owner's permissions, which decide the pages the agent is offered. */
export interface PageCatalogContext {
  course: Pick<Course, 'id' | 'show_getting_started'>;
  authz_data: object;
}

/**
 * Whether a course owner sees this tab on every page of its group. Tabs gated on a per-request
 * feature (AI grading, LTI 1.1, billing, question sharing) read flags this context lacks, so they
 * are left out rather than offered and then not found.
 */
function shownToOwner(
  renderCondition: ((resLocals: UntypedResLocals) => boolean) | undefined,
  { course, authz_data }: PageCatalogContext,
) {
  if (!renderCondition) return true;
  return Boolean(
    renderCondition({
      course,
      // Student-data access varies by course instance and is not known here, so pages that need
      // it are offered and report missing access themselves.
      authz_data: {
        ...authz_data,
        has_course_instance_permission_view: true,
        has_course_instance_permission_edit: true,
      },
      // Question pages are only opened for this course's own questions.
      question: { course_id: course.id },
    }),
  );
}

/**
 * The instructor navigation tabs a course owner always sees, keyed like the page location
 * (`navPage.subPage`), so a page added to the navigation becomes one the agent can open. The side
 * nav comes first, so its labels win where a page is also the first tab of its group ("Course
 * settings" over "General").
 */
function agentPages(context: PageCatalogContext) {
  const navPageTabs = getNavPageTabs();
  const tabs = [
    ...Object.values(sideNavPagesTabs)
      .flat()
      .filter((tab) => tab.activePages[0] in GROUP_PARAMS)
      .map((tab) => ({
        group: tab.activePages[0] as Group,
        subPage: tab.activeSubPages[0],
        label: tab.tabLabel,
        urlSuffix: tab.urlSuffix,
        renderCondition: tab.renderCondition,
      })),
    ...(Object.keys(GROUP_PARAMS) as Group[]).flatMap((group) =>
      navPageTabs[group].map((tab) => ({
        group,
        subPage: [tab.activeSubPage].flat()[0],
        // Labels that depend on the request fall back to their plain form.
        label: typeof tab.tabLabel === 'function' ? tab.tabLabel({}) : tab.tabLabel,
        urlSuffix: tab.urlSuffix,
        renderCondition: 'renderCondition' in tab ? tab.renderCondition : undefined,
      })),
    ),
  ];
  const pages = new Map<string, AgentPage>();
  for (const tab of tabs) {
    const key = `${tab.group}.${tab.subPage}`;
    if (pages.has(key) || !shownToOwner(tab.renderCondition, context)) continue;
    pages.set(key, {
      group: tab.group,
      entry: { key, label: tab.label, params: GROUP_PARAMS[tab.group] },
      urlSuffix: tab.urlSuffix,
    });
  }
  return pages;
}

export function buildPageCatalog(context: PageCatalogContext): PageCatalog {
  return [...agentPages(context).values()].map((page) => page.entry);
}

export function findAgentPage(key: string, context: PageCatalogContext) {
  return agentPages(context).get(key)?.entry;
}

interface PageRows {
  course: Pick<Course, 'id'>;
  course_instance: Pick<CourseInstance, 'id' | 'short_name'> | null;
  assessment: Pick<Assessment, 'id' | 'tid'> | null;
  question: Pick<Question, 'id' | 'qid'> | null;
}

/** The URL of a catalog page, built by the same function that builds its navigation link. */
export function agentPageUrl({
  key,
  context,
  ...rows
}: PageRows & { key: string; context: PageCatalogContext }) {
  const page = agentPages(context).get(key);
  if (!page) throw new Error(`Unknown course agent page: ${key}`);
  const urlPrefix = rows.course_instance
    ? `/pl/course_instance/${rows.course_instance.id}/instructor`
    : `/pl/course/${rows.course.id}`;
  const urlSuffix =
    typeof page.urlSuffix === 'function' ? page.urlSuffix({ ...rows, urlPrefix }) : page.urlSuffix;
  return `${urlPrefix}${urlSuffix}`;
}
