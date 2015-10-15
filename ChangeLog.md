
# ChangeLog

* __1.16.2__ - 2015-10-14

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
