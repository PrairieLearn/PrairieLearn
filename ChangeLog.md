
# ChangeLog

* __next version__ - XXXX-XX-XX

  * Add support for partial credit in Homeworks (Tim Bretl).

  * Add help text to Exam assessment instance page (Tim Bretl).

  * Add support for partial credit in exams (Tim Bretl).

  * Add `<pl_file_preview>` element (Nathan Walters).

  * Add docker image for external graders with clang (Nathan Walters).

  * Add new exam grading UX with no buttons on overview page (Matt West).

  * Add Travis CI running the docker image for consistency (Matt West).

  * Add better and faster docker re-builds (Jake Bailey).

  * Add `ZJUI` as a institution option (Matt West).

  * Add python linter (Nathan Walters).

  * Add ESLint for style checking and fix related issues (Nathan Walters).

  * Add test coverage reporting with `coverage.io` (Nathan Walters).

  * Add documentation clarification on `"role": "Student"` access.

  * Add more core libraries (backbone, PrairieDraw, etc) (Matt West).

  * Add hiding of "Grade" button for manual grading (Matt West).

  * Add docs example of mixed on-campus and remote exam (Matt West).

  * Split installing documentation into separate method sections (Matt West).

  * Remove unused dead code (`/lib/db.js`, `question-servers/shortAnswer.js`,
    and `tests/sync/*`) (Nathan Walters).

  * Remove cookie-clearing on error page (Matt West).

  * Shift most `exampleCourse` to the external `pl-template` repository.

  * Fix external graders with invalid submissions (Nathan Walters).

  * Fix handling of too-large file uploads (Matt West).

  * Fix rendering glitch in instructor question table (Matt West).

  * Fix instructor closing of assessment instances (Matt West).

  * Fix spurious "question is complete" bug (Tim Bretl).

  * Fix bug in sigfig method of comparison when correct answer is zero (Tim Bretl).

  * Fix bug in pl_file_upload where students could upload arbitrary files (Nathan Walters).

  * Fix render bug on exams for questions without points (Matt West).

  * Fix assessment authorization when mode is NULL (Matt West).

  * Fix bug that prevented scalars from being rendered by `pl_matrix_output` (Tim Bretl).

  * Fix bug that prevented unicode minus from being parsed by `pl_matrix_output` and `pl_number_input` (Tim Bretl).

  * Fix external grading score display when score is missing (Nathan Walters).

* __2.10.1__ - 2017-05-24

  * Fix display of saved submissions for Exam assessments.

* __2.10.0__ - 2017-05-20

  * Add real-time grading job status with websockets (Nathan Walters).

  * Add full DB schema migration system (Nathan Walters).

  * Add unit tests for DB migrations (Nathan Walters).

  * Add Python modules for autograders: `numpy`, `scipy`, `matplotlib`,
    `sympy`, and `pandas` (Jordi Paris Ferrer).

  * Add `scipy` and `numpy` to the PL docker image.

  * Add documentation on the new authentication flow.

  * Add more developer documentation on the database schema.

  * Add export of full database in CSV, optionally anonymized.

  * Use Python 3.5 for autograders in `exampleCourse` (Nathan Walters).

  * Fix docker build script usage help.

  * Fix base64 encoding of uploaded files.

* __2.9.1__ - 2017-05-17

  * Fix handling of failed grading jobs (Nathan Walters).

* __2.9.0__ - 2017-05-14

  * Add support for Google OAuth2 authentication.

  * Shift documentation to Read the Docs.

  * Fix handling of Unicode characters in question data.

* __2.8.0__ - 2017-05-04

  * Add DB storage of exam mode networks.

  * Add `config` table to DB with system `display_timezone`.

  * Fix async handling in regrading unit tests.

* __2.7.0__ - 2017-04-28

  * Add `/pl/webhooks/ping` endpoint for automated health checks.

  * Add `singleVariant` flag for non-randomized questions.

  * Add documentation and improve layout for external autograder files
    (Nathan Walters).

  * Add link to detailed instances CSV file on instructor assessment page.

  * Add more assessment CSV download options.

  * Allow development use of non-master git branches for courses.

  * Fix `max_points` update during regrading.

  * Fix env var security in autograder containers (Jordi Paris Ferrer).

  * Fix external autograder output display (Nathan Walters).

  * Fix home directory detection for external autograder jobs.

  * Fix rendering of table row lines in student question lists.

* __2.6.0__ - 2017-04-16

  * Add full external autograder support with AWS and local docker support
    (Nathan Walters, Jordi Paris Ferrer).

* __2.5.3__ - 2017-04-14

  * Fix docker build with `migrations/` directory.

* __2.5.2__ - 2017-04-14

  * Fix regrading support.

* __2.5.1__ - 2017-04-12

  * Fix Exam reservation enforcement when multiple reservations exist.

* __2.5.0__ - 2017-04-11

  * Speed up rendering of instructor pages with assessment statistics.

  * Speed up calculation of assessment durations.

  * Speed up pages with job sequences.

  * Add per-day mean scores to the by-day score plot.

  * Add `points` and `max_points` output to assessment_instances CSV.

  * Add `migrations/` directory for ordered DB schema changes.

  * Fix assessment duration estimation for homeworks (1-hour gap maximum).

  * Fix CSV link on gradebook page.

  * Fix sorting of assessment on gradebook page.

  * Fix CSV download on instructor assessments overview page.

  * Fix date format in activity log CSV.

  * Fix links to questions on activity log pages.

  * Remove "permanent URL" on instructor assessments overview page.

* __2.4.1__ - 2017-04-08

  * Set question `feedback` to the empty object when missing.

* __2.3.2__ - 2017-04-08

  * Set question `feedback` to the empty object when missing.

* __2.4.0__ - 2017-04-07

  * Add connection to PrairieSchedule to enforce Exam reservations.

  * Fix ordering of assessment set headers in assessment lists.

  * Fix duration calculations to be from assessment start to last submission.

  * Show all submissions in downloaded CSV files even in dev mode.

  * Fix `Manual` grading type (Jake Bailey).

  * Change `forceMaxPoints` to only take affect during an explicit regrade.

* __2.3.1__ - 2017-03-23

  * Don't display deleted courses on the enroll (add/remove courses) page.

* __2.3.0__ - 2017-03-08

  * Change `feedback` to be visible for open questions on exams.

  * Make `feedback` visible within `submission.html` (Ray Essick).

  * Fix auto-finishing of exams after a 6-hour timeout.

  * Add regrading support with `forceMaxPoints` option.

  * Add preliminary external autograder support by the HackIllinois team
    (Genna Helsel, Teju Nareddy, Jordi Paris Ferrer, Nathan Walters).

  * Add question points and percentage scores to `*_final_submissions.csv`.

  * Add per-day score histograms to instructor assessment page (Paras Sud).

* __2.2.2__ - 2017-02-23

  * Add more indexes and improve unique constraint ordering for indexes.

* __2.2.1__ - 2017-02-18

  * Only show feedback for open exams in CS 233.

* __2.2.0__ - 2017-02-18

  * Show feedback for graded questions on exams, even if exam is
    still open (Jake Bailey).

* __2.1.3__ - 2017-02-17

  * Prevent multiple submissions to a single homework question variant.

  * Fix option passing to question server.js functions.

  * Fix course deletion on Admin page.

* __2.1.2__ - 2017-02-15

  * Catch bad Shibboleth authentication data with "(null)" UID.

  * Fix logging of `instance_question_id` in response.

* __2.1.1__ - 2017-02-13

  * Update ChangeLog.

* __2.1.0__ - 2017-02-13

  * Fix division-by-zero error in homeworks when `max_points` is zero
    (Jake Bailey).

  * Fix typos in documentation (Andre Schleife).

  * Fix MTF questions.

  * Fix assessment links on Instructor Gradebook page.

  * Fix XSS vulnerability by storing `questionJson` in base64.

* __2.0.3__ - 2017-02-04

  * Cache `instance_questions.status` to speed up page loads.

* __2.0.2__ - 2017-02-04

  * Speed up SQL query in `instance_questions` authorization.

* __2.0.1__ - 2017-01-28

  * Fix incorrect `max_points` for homeworks with question alternatives.

* __2.0.0__ - 2017-01-13

  * Make v2 the primary version and shift the old v1 to a subdirectory.

  * Add support for syncing a course from a remote git repository.

  * Add dev mode with local disk syncing and other dev features.

  * Convert score_perc to double (instead of integer).

  * Add UUIDs to all input JSON files to support renaming.

  * Convert all DB tables to bigserial primary keys.

  * Add docker build for course development.

  * Add question difficulty vs discrimination plots (Paras Sud).

  * Add 'Administrator' users will full site access.

  * Standardize names of JSON files and client/server file directories.

  * Clean up JSON file formats for everything except questions.

  * Add documentation for all v2 file formats.

  * Add conversion script from v1 to v2 assessment format (Dallas Trinkle).

* __1.22.0__ - 2016-12-09

  * Add IP ranges for final exams in DCL.

  * Fix docker instructions (Allen Kleiner).

  * Skip update of test instances for non-existent tests.

  * Fix crashing bug due to function call typo (Kevin Wang).

  * Don't attempt to generate statistics for non-existent questions.

  * Improve robustness of `submittedAnswer` restore for Fabric.js questions.

  * Add `fixedExponential` formatter.

  * Add raw score (full precision) to CSV downloads.

  * Fix logging error (Eric Huber).

  * Generate hi-res versions of LaTeX images for Fabric.js support.

  * (V2) Enable assessments with multiple instances per student.

  * (V2) Fix submission rendering for admin question views (Ray Essick).

  * (V2) Add past submissions view on exam question pages (Ray Essick).

  * (V2) Add underlying support for external (RabbitMQ) and manual grading.

  * (V2) Fix grading operations outside the main transaction.

  * (V2) Add question alternatives within assessments.

  * (V2) Implement generic CSRF protection for all pages.

  * (V2) Split site into Admin and User pages.

  * (V2) Add unified homepage with course list and self-enrollment.

  * (V2) Fix SQL import newline handling on Windows.

  * (V2) Add docker build.

  * (V2) Add admin view of individual assessment instances.

* __1.21.0__ - 2016-09-14

  * Use hi-res time for random seeds, improving test randomization.

  * Improve margins around `Save answer` buttons (Eric Huber).

  * Improve sorting of tests with identical numbers to sub-sort on titles.

  * Fix handling of question shuffling within tests (Binglin Chen).

  * Fix user role reading from `courseInfo.json`.

  * Fix error-handling code in `POST /submissions`.

  * Remove Siebel 0224 from `Exam` mode (Jeffrey Tolar).

  * (V2) Automatically regenerate assessment statistics every 10 minutes.

  * (V2) Fix CSV statistics downloads.

  * (V2) Switch to local copy of MathJax.

  * (V2) Implement access date display.

  * (V2) Implement `Exam` and `Homework` assessment types.

* __1.20.0__ - 2016-08-24

  * Fix `jsPlumb` naming case (Jeffrey Tolar).

  * Remove `/export.csv` endpoint (Kevin Wang).

  * Explicitly specify dependency versions in `package.json` (Kevin Wang).

  * Validate effective UID before creating tInstances (Kevin Wang).

  * Fix display of `trueAnswers` for all questions (Kevin Wang).

  * Document the Reload button (Jeffrey Tolar).

  * Fix role changing restrictions (Jeffrey Tolar).

  * Improve naming of exam grade/finish buttons and modal texts (Kevin Wang).

  * Show zone titles within tests (Jeffrey Tolar).

  * Remove current exam score from sidebar (Kevin Wang).

  * Split out helper modules from server code (Jeffrey Tolar).

  * Warn user when exam has unanswered questions (Kevin Wang).

  * Improve user feedback when all exam questions are answered (Kevin Wang).

  * Fix viewport width handling (Jeffrey Tolar).

  * Upgrade to ExpressJS 4.x.

  * Disallow multiple submissions for a single homework question instance (Kevin Wang).

  * Fix all server-side error handling to use standard NodeJS convention (Kevin Wang).

  * Fix race condition on client initialization (Jeffrey Tolar).

  * Improve server-side RequireJS usage (Jeffrey Tolar).

  * Add submissions directly from the command line (Kevin Wang).

  * Improve docs for Windows installations (Dave Mussulman).

  * Expose `PLConfig` to backend to access server URL (Kevin Wang).

  * Fix crash on `GET /clientFiles/` (Kevin Wang).

  * Fix handling of large git pulls of class data (Jeffrey Tolar).

  * Fix `mtfclient` to properly handle checkbox listening (Terence Nip).

  * Fix percentage score exports.

  * Switch exam-mode IP blocks to new CBTF location in Grainger.

  * Add new drawing commands for LShape, TShape, DistLoad (Mariana Silva).

  * Store latex text images per-course rather than globally.

  * Add homework random shuffle mode with global question numbers (Binglin Chen).

  * (V2) Add experimental backend using PostgresQL and server-side rendering.

* __1.19.0__ - 2016-02-23

  * Add Ace editor for in-question code editing (Terence Nip).

  * Add `MultipleTrueFalse` question type (Terence Nip).

  * Upgrade MathJax to 2.6.0 to fix "vertical bar" rendering problem.

  * Add `adm-zip` support for questions to create zip files (Craig Zilles).

  * Enable embedded images in MultipleChoice and Checkbox question types.

  * Fix bugs related to reporting of PrairieLearn git version.

  * Add Errors tab for instructors to see server-side errors, and report more errors.

  * Add Reload button in development mode.

  * Add support for variable credit on tests (bonus credit and partial credit).

  * Remove the Adaptive test type (superseded by Game).

  * Add validation for dates on server load.

  * Fix display of question answer feedback during RetryExams.

  * Change all test scores to be stored as percentages without decimal places (rounded down).

  * Add `{{params.a | vector}}` template for bracketed vectors.

  * Support IP range checking for Siebel basement labs.

* __1.18.0__ - 2016-01-20

  * Fix security hole to restrict question access to accessible tests.

  * Add `jsplumb` support (Terence Nip).

* __1.17.0__ - 2015-11-04

  * Fix missing `questionFile()` caused by upgraded underscore templating.

  * Fix sorting of tests with mixed integer/string numbers.

  * Fix broken PrairieDraw figures after submission grading.

  * Fix role changes on User page with Firefox.

  * Fix username setting when UID is set.

  * Fix User page dropdowns to default to current state.

  * Add a User page button to change back to the authenticated UID.

  * Fix missing user list in dropdown after UID change.

  * Add "Troubleshooting" documentation page with frequently asked questions.

  * Add documentation about tests and questions versus test instances and question instances.

  * Add `Checkbox` question type.

  * Add `exampleCourse/questions/randomZip` example.

  * Remove unused `backend/questions` and `backend/tests` templates in favor of `exampleCourse`.

  * Include MathJax inside PrairieLearn.

  * Fix TeX label generation scripts to support Python 3.X and `courseDir` config variable.

* __1.16.1__ - 2015-10-12

  * Fix alignment of date plots on Safari.

* __1.16.0__ - 2015-10-12

  * Link questions on test "Admin" pages to question instances.

  * Add statistics by day for exam-type tests.

* __1.15.2__ - 2015-10-09

  * Fix doc references from "Assessment Detail" to assessment "Admin" page.

* __1.15.1__ - 2015-10-08

  * Clean up `particleMotion` example HTML templates.

* __1.15.0__ - 2015-10-08

  * Enable feedback in questions during exams and add `particleMotion` example.

* __1.14.1__ - 2015-10-08

  * Fix documentation typo in test access control section.

* __1.14.0__ - 2015-10-08

  * Add "uids" as an access rule restriction in test "allowAccess".

* __1.13.2__ - 2015-10-08

  * Use a locally-hosted copy of MathJax.

* __1.13.1__ - 2015-10-04

  * Fix test statistics for `Exam` and `PracExam` tests.

* __1.13.0__ - 2015-10-04

  * Plot score histogram in test admin view (Binglin Chen @chen386).

  * Add question statistics to test admin view.

  * Display PrairieLearn version number on the Sync page.

* __1.12.1__ - 2015-09-24

  * Fix test statistics for `RetryExam` using zones.

* __1.12.0__ - 2015-09-24

  * Standardize question numbering to be like #3.8 rather than #3-8 (Terence Nip @tnip).

  * Fix schema validation and example for RetryExams with multiple qids in a question.

* __1.11.1__ - 2015-09-23

  * Fix build bug with missing moment-timezone.

  * Remove deprecation warning for `questionGroups` in `RetryExam`.

* __1.11.0__ - 2015-09-23

  * Redesign of the "Assessment" page to be more compact and consistent.

  * Add `zones` to `RetryExam` to control question-order randomization.

  * Add `variantsPerQuestion` and `unlimitedVariants` options for `RetryExam`.

  * Improve test naming consistency and fix navbar link bugs with tests.

  * Allow test numbers to be strings.

* __1.10.2__ - 2015-09-19

  * Fix bug introduced by 1.10.1 that broke all tests (overly general change events).

* __1.10.1__ - 2015-09-18

  * Fix bug that caused the "User" page to not display changes in user, role, or mode.

* __1.10.0__ - 2015-09-15

  * Add "reset test" capability for instructors.

  * Only allow questions to be solved for accessible tests.

  * Add export test data capability for instructors.

  * Add summary test statistics for instructors.

* __1.9.1__ - 2015-09-11

  * Fix docs/example to add blank target for test text links.

  * Fix `clientFiles` to also handle subdirectories.

* __1.9.0__ - 2015-09-11

  * Add `clientFiles` and docs for adding text/files to tests.

* __1.8.1__ - 2015-09-10

  * Fix security hold where anyone could access `/export.csv`.

* __1.8.0__ - 2015-09-09

  * Add optional header text for `RetryExam` (for formula sheets, etc).

* __1.7.6__ - 2015-09-09

  * Load frontend website even if there were errors fetching data.

* __1.7.5__ - 2015-09-07

  * Reload all question `server.js` files after "Sync" with a git course repository.

* __1.7.4__ - 2015-09-06

  * Correctly give highest score for assessments with duplicate scores.

* __1.7.3__ - 2015-09-06

  * Fix bug that created multiple tInstances.

* __1.7.2__ - 2015-09-02

  * Fix `exampleCourse/questions/addVectors` to use `QServer` so `gradeAnswer()` is truly optional.

* __1.7.1__ - 2015-09-02

  * Fix schema links in documentation.

  * Add documentation for question options.

  * Add docs and text on the User page to describe the server `mode` in more detail.

* __1.7.0__ - 2015-09-01

  * Don't generate new question variants until the old variant is answered.

* __1.6.0__ - 2015-09-01

  * Make `exampleCourse/tests/homework1` visible by default.

  * Display course name in page title.

  * Use "assessment" rather than "homework" or "test" in user-visible strings.

* __1.5.2__ - 2015-08-31

  * Fix example `backend/config.json` in the docs.

* __1.5.1__ - 2015-08-30

  * Clarify docs about user role setting.

* __1.5.0__ - 2015-08-26

  * Enable exam mode detection via hard-coded IP range for the CBTF.

* __1.4.1__ - 2015-08-26

  * `export.csv` now uses test `set` rather than `type` for test names.

* __1.4.0__ - 2015-08-25

  * Add documentation and help text for Sync page.

  * Fix display of commit information when using older versions of git.

  * Add figure to example question `addVectors` in `exampleCourse`.

* __1.3.2__ - 2015-08-24

  * Fix `allowAccess` checks to not always fail.

* __1.3.1__ - 2015-08-24

  * Fix `pulls` error when `gitCourseBranch` is not set.

* __1.3.0__ - 2015-08-24

  * Change default `allowAccess` to block all non-instructor access.

* __1.2.1__ - 2015-08-24

  * Fix race condition in user creation and correctly record user names.

* __1.2.0__ - 2015-08-23

  * Add "Sync" feature to pull from a git repository.

  * Fix missing `template` field in `config.json` schema.

  * Improve error logging with more specific error information.

* __1.1.0__ - 2015-08-22

  * Add access logging to the database.

* __1.0.2__ - 2015-08-19

  * Documentation fixes following the bootcamp.

  * Fix undefined logger error if `config.json` contains errors (reported by Craig and Mariana).

* __1.0.1__ - 2015-08-18

  * Fix `npm` module list during bootcamp (remove `nodetime`, add `moment`).

* __1.0.0__ - 2015-08-18

  * First public release for pre-Fall-2015 bootcamp.
