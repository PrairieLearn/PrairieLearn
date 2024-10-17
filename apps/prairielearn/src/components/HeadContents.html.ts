import { html } from '@prairielearn/html';

import { compiledScriptTag, nodeModulesAssetPath, assetPath } from '../lib/assets.js';
import { config } from '../lib/config.js';
import {
  type Assessment,
  type AssessmentSet,
  type Course,
  type CourseInstance,
} from '../lib/db-types.js';

interface TitleOptions {
  resLocals: {
    assessment?: Assessment;
    assessment_set?: AssessmentSet;
    instance_question_info?: { question_number: string };
    course?: Course;
    course_instance?: CourseInstance;
    navPage?: string;
    navSubPage?: string;
    navbarType?: string;
    use_bootstrap_4?: boolean;
  };
  pageTitle?: string;
  pageNote?: string;
}

export function HeadContents(titleOptions: TitleOptions) {
  const bootstrapModule = titleOptions.resLocals.use_bootstrap_4 ? 'bootstrap-4' : 'bootstrap';
  const bootstrapVersion = titleOptions.resLocals.use_bootstrap_4 ? '4' : '5';
  return html`
    <meta charset="utf-8" />
    <meta http-equiv="X-UA-Compatible" content="IE=edge" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="bootstrap-version" content="${bootstrapVersion}" />
    ${config.cookieDomain
      ? html`<meta name="cookie-domain" content="${config.cookieDomain}" />`
      : ''}
    <title>${getTitle(titleOptions)}</title>
    <link
      href="${nodeModulesAssetPath(`${bootstrapModule}/dist/css/bootstrap.min.css`)}"
      rel="stylesheet"
    />
    <link
      href="${nodeModulesAssetPath('bootstrap-icons/font/bootstrap-icons.css')}"
      rel="stylesheet"
    />
    <link href="${assetPath('stylesheets/colors.css')}" rel="stylesheet" />
    <link href="${assetPath('stylesheets/local.css')}" rel="stylesheet" />
    <script src="${nodeModulesAssetPath('jquery/dist/jquery.min.js')}"></script>
    <script src="${nodeModulesAssetPath(
        `${bootstrapModule}/dist/js/bootstrap.bundle.min.js`,
      )}"></script>
    <script src="${nodeModulesAssetPath('@fortawesome/fontawesome-free/js/all.min.js')}"></script>
    ${compiledScriptTag('application.ts')} ${compiledScriptTag('navbarClient.ts')}
  `;
}

// e.g. "hello_world" => "Hello World"
function displayFriendlyPage(page: string) {
  return page
    .toLowerCase()
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.substring(1))
    .join(' ');
}

/**
 * The title of the page is composed of the following parts, in this order:
 * 1. The custom `pageTitle`, or a friendly version of `navSubPage` if the `pageTitle` is not provided.
 *    - If `pageNote` is provided, it is appended in parenthesis after the first part.
 * 2. The assessment (including instance question info) if available.
 * 3. The course (including course instance if the user is an instructor) if available.
 * 4. A friendly version of `navPage` if neither of the options above is available.
 * 5. The string "PrairieLearn" (fixed).
 */
function getTitle({ resLocals, pageTitle, pageNote }: TitleOptions) {
  if (config.titleOverride) {
    return config.titleOverride;
  }
  const {
    assessment,
    assessment_set,
    instance_question_info,
    course,
    course_instance,
    navPage,
    navSubPage,
    navbarType,
  } = resLocals;

  const navTrace: string[] = [];

  // If pageTitle is defined, use it,
  // otherwise, generate lowest-level page name from navSubPage
  let displayedTitle = '';
  if (pageTitle != null) {
    displayedTitle = pageTitle;
  } else if (navSubPage != null) {
    displayedTitle = displayFriendlyPage(navSubPage);
  }
  if (displayedTitle) navTrace.push(displayedTitle);

  // If pageNote is defined, add it in parenthesis
  // after the first navTrace entry
  if (navTrace.length > 0 && pageNote != null) {
    navTrace[0] += ` (${pageNote})`;
  }

  if (assessment != null && assessment_set != null) {
    const assessment_abbreviation = `${assessment_set.abbreviation}${assessment.number}`;
    // Possibilities need to be enumerated because
    // instance_question_info.question_number is formatted differently for
    // homework and exams.
    if (instance_question_info != null) {
      if (assessment.type === 'Homework') {
        navTrace.push(instance_question_info.question_number);
      } else if (assessment.type === 'Exam') {
        navTrace.push(`${assessment_abbreviation}.${instance_question_info.question_number}`);
      }
    } else {
      navTrace.push(assessment_abbreviation);
    }
  }

  // If page is associated with a particular course,
  // always display the short name, e.g. QA 101
  if (course != null) {
    let courseName = course.short_name ?? '';
    // If an instructor is viewing, always display the
    // short course instance name, e.g. fa19
    if (navbarType === 'instructor' && course_instance != null) {
      courseName += ', ' + course_instance.short_name;
    }
    navTrace.push(courseName);
  } else if (navPage != null && navPage !== 'error' && !displayedTitle) {
    navTrace.push(displayFriendlyPage(navPage));
  }
  return `${config.devMode ? '[DEV]' : ''} ${navTrace.length > 0 ? navTrace.join(' — ') + ' | ' : ''} PrairieLearn`;
}
