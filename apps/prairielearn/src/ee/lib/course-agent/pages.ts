import type { NavigationTarget, PageCatalog } from '@prairielearn/course-agent-types';
import { HttpStatusError } from '@prairielearn/error';

import type { NavPage } from '../../../components/Navbar.types.js';
import { sideNavPagesTabs } from '../../../components/SideNav.js';
import type { Assessment, Course, CourseInstance, Question } from '../../../lib/db-types.js';
import { getNavPageTabs } from '../../../lib/navPageTabs.js';
import type { UntypedResLocals } from '../../../lib/res-locals.types.js';
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
  entry: PageCatalog[number];
  urlSuffix: string | ((resLocals: UntypedResLocals) => string);
}

/** The course and the course owner's permissions, which decide the pages the agent is offered. */
interface PageCatalogContext {
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
      entry: { key, label: tab.label, params: GROUP_PARAMS[tab.group] },
      urlSuffix: tab.urlSuffix,
    });
  }
  return pages;
}

export function buildPageCatalog(context: PageCatalogContext): PageCatalog {
  return [...agentPages(context).values()].map((page) => page.entry);
}

interface PageRows {
  course: Pick<Course, 'id'>;
  course_instance: Pick<CourseInstance, 'id' | 'short_name'> | null;
  assessment: Pick<Assessment, 'id' | 'tid'> | null;
  question: Pick<Question, 'id' | 'qid'> | null;
}

/** Builds a page's URL with the same function that builds its navigation link. */
function pageUrl(page: AgentPage, rows: PageRows) {
  const urlPrefix = rows.course_instance
    ? `/pl/course_instance/${rows.course_instance.id}/instructor`
    : `/pl/course/${rows.course.id}`;
  const urlSuffix =
    typeof page.urlSuffix === 'function' ? page.urlSuffix({ ...rows, urlPrefix }) : page.urlSuffix;
  return `${urlPrefix}${urlSuffix}`;
}

/**
 * The URL and label of the page the agent named, with its names resolved the way course files name
 * things. The messages tell the agent what to correct.
 */
export async function resolveAgentPage(context: PageCatalogContext, target: NavigationTarget) {
  const { course } = context;
  const page = agentPages(context).get(target.page);
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
  // A course instance is used whenever it is named, so a question page can open under it. An
  // assessment or question is looked up only for the pages that require one.
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
    throw new HttpStatusError(404, `This course has no question named "${target.question}".`);
  }
  return {
    url: pageUrl(page, { course, course_instance, assessment, question }),
    label: page.entry.label,
  };
}
