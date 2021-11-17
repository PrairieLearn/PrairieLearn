# ChangeLog

- **next version** - XXXX-XX-XX

  - Add python libraries sklearn and nltk to plbase, and preload them in python trampoline (Binglin Chen).

  - Add UUIDs to cron job logs for better debugging (Matt West).

  - Add report of unsuccessful cron jobs (Matt West).

  - Add dev docs for interfacing async/await code (Matt West).

  - Add integration tests for daily cron jobs (Matt West).

  - Add example docker grading images for externally graded questions (James Balamuta).

  - Add ANSI color support to `pl-external-grader-results` element (Nathan Walters).

  - Add `min-lines`, `max-lines`, and `auto-resize` to change the number of lines displayed in the `pl-file-editor` (James Balamuta).

  - Add example question for the `pl-file-editor` element to element example gallery (James Balamuta).

  - Add docs for `singleVariant` question option (Matt West).

  - Add file attachments to student assessments and questions (Matt West).

  - Add connecting IP address report in instructor effective user page (Dave Mussulman).

  - Add SSL https support inside the Docker container (Dave Mussulman).

  - Add `pl-hide-in-panel` element (Matt West).

  - Add `pl-drawing` element (Mariana Silva and Nicolas Nytko)

  - Add `pl-python-variable` element for displaying Pandas dataframes and Python variables (Nicolas Nytko).

  - Add student Gradebook page (Matt West).

  - Add CloudWatch statistics for external grader lifecycles (Matt West).

  - Add python library `tzlocal` (James Balamuta).

  - Add console stack traces on Node warnings (Matt West).

  - Add support for Latex in `<markdown>` tags (Nathan Walters).

  - Add support for rendering graphs using adjacency matrices in `pl-graph` (Nicolas Nytko).

  - Add FAQ entries for escaping math mode in questions and accessing the `data` object on an external grader (James Balamuta).

  - Add a new example question showing a probability mass function with `pl-python-variable` (James Balamuta).

  - Add `gvsu.edu` as an institution option (Matt West).

  - Add `scikit-learn`, `scikit-image`, and other data science libraries to external Python grader (Nicolas Nytko).

  - Add 'paths-lookup' database tool (Dave Mussulman).

  - Add more detailed grader statistics (Matt West).

  - Add diagnostics for external grader results processing (Dave Mussulman).

  - Add the `ucidata` package to `centos-plbase` (James Balamuta, h/t David Dalpiaz).

  - Add navbar dropdowns to swap between courses, course instances, and assessments (Tim Bretl).

  - Add ability to create and modify all course content in the browser without docker or git (Tim Bretl).

  - Add support for Rust to `pl-code` element (Nathan Walters).

  - Add tests for LTI auth (Dave Mussulman).

  - Add more robust Python autograder to `prairielearn/grader-python` (Nathan Bowman and Nicolas Nytko).

  - Add choose course instance dropdown to instructor nav-bar when viewing course only (Tim Bretl).

  - Add file size limit to student-visible part of `pl-file-upload` (Nathan Bowman).

  - Add explanation of `None` role in documentation and instructor gradebook view (James Balamuta).

  - Add support for editing from bare git repo (Tim Bretl).

  - Add instructor panel to `course` question pages (Tim Yang).

  - Add `disregard-extra-elements` attribute to `pl-drawing` element to ignore duplicate grading objects (Nicolas Nytko).

  - Add extra `/course*` mount points (Tim Yang).

  - Add R vector/matrix support in `pl-variable-output` (James Balamuta).

  - Add example course question templates (James Balamuta).

  - Add support for pages to set their own titles in browser tabs via `res.locals.pageTitle` (David Mitchell)

  - Add extra `/course*` mount points (Tim Yang).

  - Add confirmation dialog for unsaved changes on question pages (Tim Yang).

  - Add Python library regex to plbase (Nathan Bowman).

  - Add `all-of-the-above` and `none-of-the-above` attributes to `<pl-multiple-choice>` (Bojin Yao)

  - Add `external-json` attribute to `<pl-multiple-choice>` (Bojin Yao)

  - Change v3 questions to disable autocomplete on the question form (Nathan Walters).

  - Change `centos7-python` to `grader-python` and place it under `graders/` (James Balamuta).

  - Change blocked-event-loop detection to be more lightweight in production (Matt West).

  - Change file editing access to `Editor`, down from `Owner` (Matt West).

  - Change syncing to be more resilient and to record errors/warnings encountered during sync (Nathan Walters).

  - Change element default setup to be top-down instead of inline (James Balamuta).

  - Change `type: "Exam"` under `mode: "Public"` to not display "waiting for proctor..." message (James Balamuta).

  - Change Travis script to rebuild `prairielearn/centos7-plbase` if any relevant files have changed (Nathan Walters).

  - Change location of draft files for file editor from S3 (prod) / local (dev) to `file-store` (Tim Bretl).

  - Change docker to use CentOS7 python3 instead of python36u (Dave Mussulman).

  - Change SSL file paths to be configurable (Dave Mussulman).

  - Change `rpy2` version from 2.9.5 to 3.2.0 (James Balamuta).

  - Change institution definitions to read from the `institutions` table (Dave Mussulman).

  - Change documentation examples to be self-contained (James Balamuta).

  - Change external grader documentation to show file system structure (James Balamuta).

  - Change test infrastructure to use `testCourse` instead of `exampleCourse` (James Balamuta).

  - Change size limit for form data by increasing from 200K to 1M (Nathan Bowman).

  - Change `grader-r` docker container to include `pltest` package (James Balamuta).

  - Change navbar/navtab structure to match course content structure (Tim Bretl).

  - Change `MathJax` version from 2.7.5 to 3.0.0 (Nicolas Nytko)

  - Change and standardize naming scheme on in-browser add/copy of course instance, assessment, or question (Tim Bretl).

  - Change order in which course instances are listed to be by earliest and latest access date (Tim Bretl).

  - Change size limit for form data to account for increase from encoding (Nathan Bowman).

  - Change styling for invalid input and `pl-string-input` for increased clarity. (Nicolas Nytko)

  - Fix dead letter cron job for `async` v3 (Matt West).

  - Fix deadlock when syncing course staff (Nathan Walters).

  - Fix name of `migrations/145_file_edits__job_sequence_id__add.sql` (Matt West).

  - Fix `<pl-string-input>` handling of HTML entities in input (Nathan Walters).

  - Fix assessment password clearing cookie situations, issue #1579 (Dave Mussulman).

  - Fix the syncing of missing tags and topics (Nathan Walters).

  - Fix documentation formatting (Dave Mussulman).

  - Fix handling of duplicate topics in `infoCourse.json` (Nathan Walters).

  - Fix tags/topics duplicates checking when tag/topic is a builtin JS object property, like `toString` (Nathan Walters).

  - Fix `Makefile` for documentation to build correctly (James Balamuta).

  - Fix description of the points download description for assessments (James Balamuta, h/t Mariana Silva).

  - Fix LTI callback URL (Matt West).

  - Fix vulnerability in external grading that allows arbitrary files on the server to be overwritten (Nathan Walters).

  - Fix bug in unicode encode/decode in file editor (Tim Bretl).

  - Fix KeyboardInterrupt errors when Ctrl-C'ing out of docker (Dave Mussulman).

  - Fix disabled server load reporting to CloudWatch (Matt West).

  - Fix legacy Ace editor assets (Nathan Walters).

  - Fix stack trace error printing for externally graded question errors (Dave Mussulman).

  - Fix SSL generation to happen at docker build instead of on each run (Dave Mussulman).

  - Fix external grading results containing NULL bytes (Matt West).

  - Fix `MaxListenersExceededWarning` (Dave Mussulman).

  - Fix jobsPerInstance grader statistic (Matt West).

  - Fix null filenames from missing files in downloads (Matt West).

  - Fix `assessments.assessment_set_id` to cascade on deletes (Matt West).

  - Fix git merge during CI (Matt West).

  - Fix to prevent instructor testing of externally-graded questions (Matt West).

  - Fix LTI outcome reporting with Blackboard Learn (Dave Mussulman).

  - Fix error reporting for v2 questions (Matt West).

  - Fix detection of different internals during R package installation (James Balamuta).

  - Fix figures in `pl-drawing` documentation (Nicolas Nytko).

  - Fix use of `data["correct_answers"]` in documentation (James Balamuta, h/t Eric Huber).

  - Fix authorization for users behind web proxies (Dave Mussulman).

  - Fix admin overview page institutions (Matt West & Dave Mussulman).

  - Fix button appearance after bootstrap upgrade (Tim Bretl).

  - Fix bug in course instance switcher on file edit page (Tim Bretl).

  - Fix bug in branch links on file browser page (Tim Bretl).

  - Fix bug in element popovers (Tim Bretl).

  - Fix redirects to question preview page by maintaining query parameters (Nathan Walters).

  - Fix redirects to course admin sub-page when switching course instances (Tim Bretl).

  - Fix server-side check of new file names and paths on in-browser rename (Tim Bretl).

  - Fix in-browser course edit handler to update commit hash only when using git (Tim Bretl).

  - Fix in-browser course edit handler to keep one course lock throughout entire process (Tim Bretl).

  - Fix button alignment in popovers (Tim Bretl).

  - Fix authorization of effective user (Tim Bretl).

  - Fix in-browser add/copy of course instances to ensure user has `Instructor` role (Tim Bretl).

  - Fix permissions on issues page (Tim Bretl).

  - Fix angle tolerance checks for vectors in `pl-drawing` element (Nicolas Nytko).

  - Fix unique element checking in default grader for `pl-drawing` element (Nicolas Nytko).

  - Fix math rendering in `pl-drawing` element on Safari (Nicolas Nytko).

  - Fix server jobs so that errors are handled only once (Tim Bretl).

  - Fix course instance access check (Tim Bretl).

  - Fix `pl-string-input` incorrectly displaying whitespace and special characters (Nicolas Nytko).

  - Fix gradebook and question statistics download links (Tim Bretl).

  - Fix `demoRandomPlot` by updating the matlibplot subplot code (James Balamuta).

  - Fix default institution in course instance access rules (Tim Bretl).

  - Fix `group_work` flag when calling `authz_assessment_instance` (Tim Bretl).

  - Remove `number` column from `course_instances` table and `number` property from `infoCourseInstance.json` schema (Tim Bretl).

  - Remove introduction alert at the top of `homework` assessments (Tim Yang).

- **3.2.0** - 2019-08-05

  - Add openpyxl to the centos7-python for Excel .xlsx autograding (Craig Zilles).

  - Add feedback for correct answers in submitted answer panel (Brian Mercer).

  - Add Learning Tools Interoperability LTI 1.1.1 tool provider functionality (Dave Mussulman).

  - Add course instance admin subpages (Dave Mussulman).

  - Add networkx Python library to plbase (Nathan Bowman).

  - Add option to toggle placeholder help text for `pl-number-input` (James Balamuta and Nicolas Nytko).

  - Add `size` attribute to `pl-number-input` (Nicolas Nytko).

  - Add demo question showcasing all options for `pl-number-input` (James Balamuta and Nicolas Nytko).

  - Add read-only API for instructors to access assessment data (Nathan Walters).

  - Add networkx Python library to centos7-python (Nathan Bowman).

  - Add ability to "Grade all saved answers" on exam assessment overview (Dave Mussulman).

  - Add dead letter reporting to Slack (Matt West).

  - Add more logging for external grading jobs in production (Matt West).

  - Add documentation on common development errors to FAQ (James Balamuta).

  - Add R Data Packages and SQLite connection to centos-plbase (James Balamuta).

  - Add R package caching and parallel installation to centos-plbase (James Balamuta).

  - Add example script to download all course instance data from API (Matt West).

  - Add default tags for semester Sp19 - Fa21 (James Balamuta).

  - Add `pl-graphviz-render` element (Nathan Walters).

  - Add Graphviz Yum package and Python library to centos7-plbase and centos7-python (Nicolas Nytko).

  - Add a second example of reading XML code in from a file with `pl-code` (James Balamuta).

  - Add instructor info panel to student pages (Dave Mussulman).

  - Add ability to highlight the background of specific lines of text in `pl-code` (Nathan Walters).

  - Add R Data Packages and SQLite connection to centos-plbase. (James Balamuta).

  - Add test cases for the InstructorAssessmentDownloads page (Yuchen Pang).

  - Add verbose flag to `tools/generate_uuid.py` to show all the files changed by script (Pavitra Shadvani).

  - Add better logging of requests that don't have corresponding responses (Matt West).

  - Add student file storage for scratch paper scans (Matt West).

  - Add Mathematica language option to `string_from_numpy()` (Liz Livingston).

  - Add Mathematica tab and optional display attribute to `pl-variable-output` (Liz Livingston).

  - Add comment and child digit control for `pl-variable-output`, optional `comment` and `digits` (Liz Livingston).

  - Add vector support to `numpy_to_matlab()` and `numpy_to_matlab_sf()` (Liz Livingston).

  - Add `force-download` attribute to `pl-file-download` to specify whether to download or view in browser (Shreyas Patil).

  - Add images of elements to element documentation (James Balamuta).

  - Add check that no issues are generated by question load in `testQuestions.js` (Tim Bretl).

  - Add support for Markdown in questions with the `<markdown>` tag (Nathan Walters).

  - Add new entries to the FAQ guide (James Balamuta).

  - Add an example question containing code shown in the element documentation (James Balamuta).

  - Add example questions for `pl-multiple-choice` and `pl-integer-input` customizations (James Balamuta).

  - Add `users_select_or_insert` SPROC tests (Dave Mussulman).

  - Add `clientFilesElement` folder for loading element-specific client files (Nicolas Nytko).

  - Add `ignore-case` option to `pl-string-input` to allow for case insensitivity (James Balamuta).

  - Add dependabot status to README (Matt West).

  - Add tabs for course admin page (Tim Bretl).

  - Add in-browser editing of course files (Tim Bretl).

  - Add question score information to `all_submissions` CSV download (Matt West).

  - Add warning to `pl-checkbox` if `partial-credit-method` is set but `partial-credit` is not enabled (Nathan Walters).

  - Change "Save & Grade" button text and alignment (Dave Mussulman).

  - Change Ace editor to use source files from npm and upgrade to 1.4.1 from 1.2.8 (Nathan Walters).

  - Change external grading to receive results from an SQS queue instead of a webhook (Nathan Walters).

  - Change Exam question generation to first-access time (Matt West).

  - Change assessment access rule examId linking to examUuid (Dave Mussulman).

  - Change example question `fibonacciEditor` timeout to 20 s (Matt West).

  - Change server timeout to 10 minutes (Matt West).

  - Change API ID names to contain object type (Matt West).

  - Change API object property names for improved consistency (Matt West).

  - Change `highlight.js` from `9.12.01` to `9.13.1` in order to support `plaintext` highlighting (Nathan Walters).

  - Change all packages to current versions (Matt West).

  - Change logging format for new `winston` version (Matt West).

  - Change instructor gradebook to have more optimized HTML for a smaller response (Nathan Walters).

  - Change "timeout" external grader error to sound like the student's code is at fault (Matt West).

  - Change `cheerio` back to `v0.22.0` (Nathan Walters).

  - Change `pl-matrix-output` to `pl-variable-output` (Liz Livingston).

  - Change `string_from_2darray()` to `string_from_numpy()`, retained deprecated version (Liz Livingston).

  - Change sync procedural steps to use fetch and reset to allow for history changes (James Balamuta).

  - Change element documentation to have a separation between submission, decorative, and conditional elements (James Balamuta).

  - Change instructor question page to hide "Test 100 times" for externally graded questions (Nathan Walters).

  - Change element documentation to follow a common structure (James Balamuta).

  - Change JSON schemas to be independently publishable from PrairieLearn (Nathan Walters).

  - Change Travis CI to recognize dependabot rather than greenkeeper (Matt West).

  - Change developer docs to recommend the use of async/await (Matt West).

  - Change syncing process to be faster (Nathan Walters).

  - Change syncing process to allow for tags/topics that are not explicitly listed in `courseInfo.json` (Nathan Walters).

  - Change UUIDs to no longer be globally unique; they are not unique only in the smallest possible scope (Nathan Walters).

  - Change syncing process to validate that QIDs are not repeated in an assessment; this is a potentially breaking change (Nathan Walters).

  - Change to PostgreSQL version 11 (from version 10) (Matt West).

  - Change to NodeJS version 12 (from v10) (Matt West).

  - Change enroll page interface to allow Bootstrap modal dialogues instead of popover tooltips with buttons on them; add more verbose description of what it means to add/remove a course. (Eric Huber)

  - Change file editor to simplify the use of drafts and to improve the user interface (Tim Bretl).

  - Fix load-reporting close during unit tests (Matt West).

  - Fix PL / scheduler linking stored procedure to allow linked exams and fix bugs (Dave Mussulman).

  - Fix responsiveness and centering of images displayed with `pl-figure` (James Balamuta, h/t Dave Mussulman).

  - Fix STDERR data logging on Python start (Matt West).

  - Fix HTML on LTI configuration page (Matt West).

  - Fix LTI configuration flow configuration (Matt West).

  - Fix GitHub links to exampleCourse questions (Dave Mussulman).

  - Fix exclude file list for code coverage (Matt West).

  - Fix `dump_filter.sh` to keep `authn_users` in all tables (Matt West).

  - Fix issues link on instructor question page (Nathan Walters).

  - Fix `users.lti_course_instance_id` foreign key delete action (Matt West).

  - Fix CSV stringifier which blocks the event loop (Yuchen Pang).

  - Fix missing `event-stream` dependency (Matt West).

  - Fix `pl.inner_html(...)` helper function (Nathan Walters).

  - Fix slow gradebook API by removing `last_submission_date` (Matt West).

  - Fix API IDs to be JSON integers (Matt West).

  - Fix underscore in `pl-string-input` docs (Matt West).

  - Fix Python linter errors in (Matt West).

  - Fix `pl-code` HTML escaping (Nathan Walters).

  - Fix legacy question renderer by explicitly using `htmlparser2` for cheerio (Nathan Walters).

  - Fix error message when a tag is missing (Matt West, h/t Mariana Silva).

  - Fix GitHub links in `mkdocs.yml` (Eric Huber).

  - Fix typo in documentation (Eric Huber).

  - Fix docs for `examUuid` usage (Matt West).

  - Fix `htmlparser2` config by copying default options from Cheerio (Nathan Walters).

  - Fix traceback in console log for python errors (Tim Bretl).

  - Fix render cache stats to limit to last day (Matt West).

  - Fix escape sequence of code specified in the `source-file-name` options of `pl-code` (James Balamuta).

  - Fix local grader not removing volumes associated with containers (Nathan Walters).

  - Fix Python autograder container build (Matt West).

  - Fix documentation to be more descriptive for local development with externally graded questions, especially in Windows. (Dave Mussulman, h/t James Balamuta, Mariana Silva, Zhenxi Zhou)

  - Fix copy button (Tim Bretl).

  - Fix python question random to seed from `variant.variant_seed` (Dave Mussulman).

  - Fix TravisCI for Greenkeeper PRs (Matt West).

  - Fix vulnerabilities in node packages (Nathan Walters).

  - Fix regression from #1440 in Bootstrap popovers due to HTML sanitization (Matt West).

  - Fix elements to work with the new sanitized popovers (Matt West).

  - Fix documentation build on Read the Docs (Matt West).

  - Fix editing popovers to work with the new sanitization defaults (Matt West).

  - Fix `tools/generate_uuids.py` to not add UUID in element subdirectory (Pavitra Shadvani).

  - Fix `tools/generate_uuids.py` to be able to find uppercase UUIDs (Eric Huber).

  - Fix gradebook download link for courses with special characters in their names (Nathan Walters).

  - Fix handling of malformed LTI responses (Matt West).

  - Fix (or at least attempt to) S3 file uploads for external grading (Nathan Walters).

  - Fix handling of binary files during external grading (Nathan Walters).

  - Fix hljs syntax highlighting compatibility issue in `pl-code.py` (Eric Huber).

  - Fix JSON format when dumping DB subsets with `dump_filter.sh` (Matt West).

  - Fix vulnerabilities in node packages (Dave Mussulman).

  - Fix `users_select_or_insert` to handle NetID changes with same UIN (Dave Mussulman).

  - Fix documentation page for elements and their dependencies (Eric Huber).

  - Fix question tag syncing to be significantly faster (Nathan Walters).

  - Fix `generate_uuids.py` to only process files starting with `info` (Matt West).

  - Fix `async.doWhilst()` and `async.doUntil()` for `async` v3 (Matt West).

  - Fix best submissions downloads to use ungraded submissions as a last resort (Matt West).

  - Fix help text CSV upload example with `points` (Matt West, h/t Mariana Silva and James Balamuta).

  - Fix CSRF checking for external grading live updates (Nathan Walters).

  - Fix flaky test cases in `pl-number-input` which didn't handle comparison options properly (Mingjie Zhao).

  - Remove `allowIssueReporting` option in `infoCourseInstance.json` (Matt West).

  - Remove old temporary upgrade flag `tmp_upgraded_iq_status` (Matt West).

  - Remove `string_from_2darray_sf()` from `freeformPythonLib/prairielearn.py` (Liz Livingston)

  - Remove `number` column from `question_tags` table; question tags are now sorted by `tags.number` (Nathan Walters).

  - Remove support for `externalGradingOptions.files` in question `info.json` files (Nathan Walters).

  - Remove `number` column and the corresponding uniqueness constraint from `jobs` table (Tim Bretl).

- **3.1.0** - 2018-10-08

  - Add string input element (Mariana Silva).

  - Add element to display matrix in latex format (Mariana Silva).

  - Add student name and clickable e-mail address information to issue reports (James Balamuta).

  - Add `tools/dump_*` scripts to filter and anonymize per-course dumps (Matt West).

  - Add `pl-prairiedraw-figure` element and update PrairieDraw graphics documentation. (Ray Essick).

  - Add Control-C hint on server startup (Dave Mussulman).

  - Add improved login screen (Nathan Walters).

  - Add `pl-matrix-component-input` element (Mariana Silva).

  - Add new question renderer behind feature flag (Nathan Walters).

  - Add partial credit option to `pl-checkbox` element (Mariana Silva).

  - Add docs and two optional attributes, `display` and `label`, to `pl-symbolic-input` (Tim Bretl).

  - Add `prevent-select` attribute to `pl-code` element (Nathan Walters).

  - Add personal access token management (Nathan Walters).

  - Add `maxPoints` option to zones (Tim Bretl).

  - Add `bestQuestions` option to zones (Tim Bretl).

  - Add `allow-complex` attribute for `pl-symbolic-input` (Tim Bretl).

  - Add warm up for Python worker processes (Matt West).

  - Add better handling of client sockets on externally graded questions (Nathan Walters).

  - Add postgresql permissions for root in Docker for development (Dave Mussulman).

  - Add CSV scores upload for questions or assessments (Matt West).

  - Add Pillow to the `centos7-python` container (Dave Mussulman).

  - Add more question and assessment JSON validity checking on load (Dave Mussulman).

  - Add scroll bar in `pl-matrix-component-input` (Mariana Silva)

  - Fix `pl-file-editor` to allow display empty text editor and add option to include text from source file (Mariana Silva).

  - Fix HTML rendering by reverting `cheerio.js` to `0.22.0` (Matt West).

  - Fix Google auth using new API (Matt West).

  - Fix several issues with various elements (Nathan Walters).

  - Fix error when rendering ungraded external grading submissions (Matt West).

  - Fix sync failure if a course instance has no `assessments` directory and add warning in sync log (Ray Essick).

  - Fix Slack posting for student cheating reports (Matt West).

  - Fix assessment instance page to only show 'Finish assessment' button for password and SEB exams (Dave Mussulman).

  - Fix assessment time limits (Matt West).

  - Fix copy button after `clipboard.js` package update (Tim Bretl).

  - Fix `pl-multiple-choice` so feedback is inside label and so inline option produces valid HTML (Tim Bretl).

  - Fix "Logout" button with Google authentication (Matt West).

  - Fix error message when an authentication method is not enabled (Matt West).

  - Fix "Logout" button with Azure authentication (Matt West).

  - Fix docs for `clientServerFiles` template variables (Rahul Rameshbabu).

  - Fix bug with rendering when the render cache is disabled (Nathan Walters).

  - Fix outdated pycryptdome version (to 3.6.6) (Matt West).

  - Fix bug in `pl-symbolic-input` to handle submission of function names without arguments (Tim Bretl).

  - Fix bug in `pl-symbolic-input` to handle submissions that simplify to invalid expressions (Tim Bretl).

  - Fix bug in `pl-symbolic-input` to handle the sympy constants I and E properly (Tim Bretl).

  - Fix markup in `pl-multiple-choice` and `pl-checkbox` elements (Nathan Walters).

  - Fix slow v3 questions by using persistent forking python processes (Matt West).

  - Fix spurious `warnOldJobs` log entries (Matt West).

  - Fix label on `pl-string-input` help popover (Matt West).

  - Fix restart of Python `codeCallers` with no active child (Matt West).

  - Fix exampleCourse exam1 to include formula sheet example per docs (Dave Mussulman).

  - Fix docs for `allowIssueReporting` (Matt West).

  - Fix `pl-matrix-component-input` element to adjust height (Mariana Silva).

  - Fix real-time external grading results in exam mode by disabling exam-specific message in the question score panel (Nathan Walters).

  - Fix `tools/dump_filter.sh` to drop `pg_stat_statements` for PostgreSQL 10 (Matt West).

  - Fix slow assessment instance deletes (Matt West).

  - Fix `triangularDistributedLoad` in `PrairieDraw.js` (Mariana Silva).

  - Fix unexpected token error in administrator overview page (Tim Bretl).

  - Fix `pl-matrix-component-input` rendering bug on Safari (Nicolas Nytko).

  - Change `pl-code` to display code from a source file OR inline text (Mariana Silva).

  - Change element names to use dashes instead of underscores (Nathan Walters).

  - Change deprecated `new Buffer()` calls to `Buffer.from()` (Ray Essick).

  - Change to Node.js 10 and PostgreSQL 10 (Matt West).

  - Change `centos7-ocaml` grader image to `ocaml-4.05` (Matt West).

  - Change TravisCI tasks to run linters first (Matt West, h/t James Balamuta).

  - Change element attributes to use hyphens instead of underscores (Nathan Walters).

  - Change assessment password protection method (Dave Mussulman).

  - Change "0 rows" error to be more descriptive (Dave Mussulman).

  - Change Exam authentication options to always include Google and Azure (Matt West).

  - Change maximum JSON POST size to 1MB (Nathan Walters).

  - Change to prohibit extra `allowAccess` properties (Geoffrey Challen).

  - Change maximum JSON POST size to 1MB or local grader (Nathan Walters).

  - Change required package versions for security (Dave Mussulman).

  - Change `allowIssueReporting` to default to `true` (Matt West).

  - Change `pl-string-input` to include an attribute for the placeholder (Mariana Silva).

  - Change element documentation to add placeholder attribute to `pl-string-input` (Mariana Silva).

  - Change instructor assessment page into multiple sub-pages (Matt West).

  - Change log level of external grading jobs to reduce syslog volume (Matt West).

  - Change test cases to use templated DB for faster performance (Dave Mussulman).

  - Remove `element_index` from list of arguments passed to elements (Tim Bretl).

- **3.0.0** - 2018-05-23

  - Add improved support for very large file downloads (Nathan Walters).

  - Add support for running in production inside Docker (Matt West).

  - Add configurable authentication sources menu (Dave Mussulman).

  - Add locking to enable multi-server deployments (Matt West).

  - Add per-assessment PrairieSchedule exam linking (Matt West).

  - Add "Report cheating" page in Exam mode (Matt West).

  - Add `package-lock.json` to Docker image build (Matt West).

  - Add additional information about indices to database descriptions (Nathan Walters).

  - Add configurable `homeUrl` to support container deployments (Matt West).

  - Add caching of rendered question panels (Nathan Walters).

  - Fix migration 111 to allow re-running (Matt West).

  - Fix docs to provide workaround for `mcrypt` install error on OSX (Tim Bretl).

  - Change `popper.js` to version `1.14.0` (Tim Bretl).

- **2.12.0** - 2018-05-19

  - Add new issues page style and flexible filtering (Nathan Walters).

  - Add `pl_threejs` element (Tim Bretl).

  - Add translation to `pl_threejs` element (Tim Bretl).

  - Add `pl_code` element for code syntax highlighting (Matt West).

  - Add FAQ docs about post-semester access (Matt West).

  - Add handling of complex numbers to `pl_number_input`, `pl_matrix_input`, and `pl_matrix_output` (Tim Bretl).

  - Add more questions to unit tests (Tim Bretl).

  - Add guidance on how to update ChangeLog to docs in `contributing.md` (Tim Bretl).

  - Add server load reporting to CloudWatch (Matt West).

  - Add question QR code for proctor lookup during exams (Dave Mussulman).

  - Add course-instance-wide issue reporting flag (Matt West).

  - Add advertisement for HackIllinois 2018 (Matt West).

  - Add blocked-event-loop monitor (Matt West).

  - Add per-job load tracking (Matt West).

  - Add _R_ to the `centos7-plbase` Docker Image (James Balamuta).

  - Add `centos7-plbase` Docker image (Matt West).

  - Add memory and CPU limits to local external graders (Matt West).

  - Add `tools/` to Docker image (Matt West).

  - Add docs for generating LaTeX label images with Docker (Matt West).

  - Add option to enable networking access on external grading containers (Nathan Walters).

  - Add `sympy.ImmutableMatrix` to list of types accepted by `prairielearn.to_json()` (Tim Bretl).

  - Add form help text indicating multiple answer can be selected for `pl_checkbox` (James Balamuta).

  - Add demo question showcasing all options for `pl_checkbox` (James Balamuta).

  - Add example of how to use PL to learn student names (Tim Bretl).

  - Add exception handling to python caller to display what can't be converted to valid JSON (Tim Bretl).

  - Add tags list to question stats CSV (Matt West).

  - Add Redis to support websockets when running with multiple servers (Nathan Walters).

  - Add support for dtype in `pl.to_json` and `pl.from_json` (Tim Bretl).

  - Add better grading-instance autoscaling calculations (Matt West).

  - Add student page view tracking (Matt West).

  - Add predictive grader autoscaling (Matt West).

  - Add links to student questions on instructor assessment instance page (Matt West).

  - Add Safe Exam Browser support (Dave Mussulman).

  - Add instance question durations to CSV output (Matt West).

  - Add load-testing script (Matt West).

  - Add documentation for the `shuffleQuestions` option (Matt West).

  - Add course instance id to all question variants (Nathan Walters).

  - Add docs for external grading statistics (Matt West).

  - Add ability to restore original file in `pl_file_editor` (Nathan Walters).

  - Add `pl_integer_input` element (Tim Bretl).

  - Add consistency checks for `course_instance_id` in `variants` (Matt West).

  - Add `merge=union` strategy for `ChangeLog.md` (Matt West).

  - Add developer docs about question rendering (Matt West).

  - Add submission info modal with external grading stats (Nathan Walters).

  - Add `load-test` support for v2 questions (Matt West).

  - Fix broken file upload element (Nathan Walters).

  - Fix broken popover and improve assessment label styles (Nathan Walters).

  - Fix bug in `pl_matrix_input` that crashed on submission of large integers (Tim Bretl).

  - Fix broken popovers in input elements (Tim Bretl).

  - Fix bug in `pl_threejs` that applied different error tolerances to render and grade (Tim Bretl).

  - Fix bug in `pl_threejs` that showed wrong body position in answer panel (Tim Bretl).

  - Fix bug in `pl_threejs` to handle case when submitted answer is None (Tim Bretl).

  - Fix doc to clarify the rules for changing UUIDs (James Balamuta).

  - Fix issues on instructor question page (Nathan Walters).

  - Fix styling of file upload element (Nathan Walters).

  - Fix Google OAuth login (James Wang).

  - Fix unicode symbols and HTML entities in question.html (Matt West).

  - Fix bug in `addBinary` example question (Tim Bretl).

  - Fix error message for `display` attribute of `pl_number_input` (Matt West).

  - Fix bug in handling of MATLAB format in answers submitted to `pl_matrix_input` (Tim Bretl).

  - Fix request load tracking (Matt West).

  - Fix test-server shutdown procedures (Matt West).

  - Fix `readthedocs` build (Matt West).

  - Fix course role edit icon (Nathan Walters).

  - Fix Coveralls.io reporting (Dave Mussulman).

  - Fix tag order display (Dave Mussulman, h/t Pengyu Cheng).

  - Fix navbar role switching button text (Dave Mussulman).

  - Fix all calls of `json.dumps` to make them produce valid JSON (Tim Bretl).

  - Fix error when rendering question score panel (Nathan Walters).

  - Fix questions without tags not displaying on instructor assessment page (Jake Bailey).

  - Fix daily external grader statistics to split out receive time (Matt West).

  - Fix crash in `pl_external_grader_results` caused by malformed results (Nathan Walters).

  - Fix question order on instructor assessment instance page (Matt West).

  - Fix bug in display of input element tolerances (Tim Bretl).

  - Fix `variants.course_instance_id` migration (Matt West).

  - Fix typo in `exampleCourse/questions/positionTimeGraph` (Matt West).

  - Fix 'Load from disk' works when emulating non-instructor roles (Dave Mussulman).

  - Fix slow query for file downloads (Matt West).

  - Fix external grading documentation to describe the current code (Nathan Walters).

  - Change to Bootstrap 4 (Nathan Walters).

  - Change to NodeJS 8.x LTS (Matt West).

  - Change all node dependencies to latest versions (Nathan Walters).

  - Change `sigfig` and `decdig` method of comparison to reduce tolerance (Tim Bretl).

  - Change default relative tolerance from `1e-5` to `1e-2` (Tim Bretl).

  - Change question card coloring and collapse past submissions by default (Nathan Walters).

  - Change build process so Travis fails if changelog has not been updated (Nathan Walters).

  - Change build process to verify changelog update only on PR (Nathan Walters).

  - Change all required python packages to latest minor versions (Tim Bretl).

  - Change all bare `except:` to `except Exception:` in python code (Tim Bretl).

  - Change Docker build to start from `centos7-plbase` (Matt West).

  - Change `requirements.txt` to include `rpy2` (James Balamuta).

  - Change to Python 3.6 in `centos7-base` grader image (Matt West).

  - Change `pl_checkbox` to display form help text by default (James Balamuta).

  - Change authenication redirects to preserve originally visited URL (Dave Mussulman).

  - Change Docker postgresql to do initializations/migrations at build (Dave Mussulman).

  - Change the example course to be available to any institution (Matt West).

  - Change `centos7-plbase` docker image to not use `/PrairieLearn` directory (Matt West).

  - Change shared code to be in external PrairieLib library (Nathan Walters).

  - Change instructor issues page to show student message on new line; remove `is:automatically-reported` filter (Nathan Walters).

  - Change CSRF codes to be URL-safe (Dave Mussulman).

  - Change closed exams to not be reviewable for students (Dave Mussulman).

  - Remove HackIllinois advertisement (Matt West).

- **2.11.0** - 2017-12-29

  - Add support for partial credit in Homeworks (Tim Bretl).

  - Add help text to Exam assessment instance page (Tim Bretl).

  - Add support for partial credit in exams (Tim Bretl).

  - Add `<pl_file_preview>` element (Nathan Walters).

  - Add docker image for external graders with clang (Nathan Walters).

  - Add new exam grading UX with no buttons on overview page (Matt West).

  - Add Travis CI running the docker image for consistency (Matt West).

  - Add better and faster docker re-builds (Jake Bailey).

  - Add `ZJUI` as a institution option (Matt West).

  - Add python linter (Nathan Walters).

  - Add ESLint for style checking and fix related issues (Nathan Walters).

  - Add test coverage reporting with `coverage.io` (Nathan Walters).

  - Add documentation clarification on `"role": "Student"` access.

  - Add more core libraries (backbone, PrairieDraw, etc) (Matt West).

  - Add hiding of "Grade" button for manual grading (Matt West).

  - Add docs example of mixed on-campus and remote exam (Matt West).

  - Add Azure AD authentication (Matt West).

  - Add ZJU institution checking from ID (Matt West).

  - Add logout support for multiple authentication providers (Matt West).

  - Add PrairieGrader for external grading (Nathan Walters).

  - Add redirect handler to enable assessment deep links (Dave Mussulman).

  - Add `pycryptodome` for authenticated question data (Jake Bailey).

  - Add `v2` and `v3` tags to exampleCourse questions (Dave Mussulman).

  - Add `externalGradingOptions.timeout` parameter (Nathan Walters).

  - Add "Report an issue" button on questions (Matt West).

  - Add `allowIssueReporting` assessment option, default false (Matt West).

  - Add more statistics for external grader instances (Matt West).

  - Add "generating" animation to "Start assessment" button (Matt West).

  - Add maximum statistics for grading jobs (Matt West).

  - Add index on `grading_jobs.date` to speed up statistics (Matt West).

  - Add `to_json()` and `from_json()` to `prairielearn.py` to help JSON serialize standard types (Tim Bretl).

  - Add build-time system updates to Docker image (Jake Bailey).

  - Add new UINs for dev users to avoid conflicts in production DB (Matt West).

  - Add `partialCredit` question option (Matt West).

  - Add jsPlumb library from PL v1 (Matt West).

  - Add ability to de-link course instances from PrairieSchedule (Matt West).

  - Add explicit POST size limit of 200 KiB (Matt West).

  - Add size limits for grading jobs (100 KiB) (Nathan Walters).

  - Add linting for trailing commas (Nathan Walters).

  - Add GitHub link to instructor question view (Dave Mussulman).

  - Add instructor view of external grading logs (Nathan Walters).

  - Add legacy file path fallback to `clientFilesCourse` (Matt West).

  - Add full grading job log display from S3 (Nathan Walters).

  - Add instructor editing of total points and question points for assessment
    instances (Matt West).

  - Add `addBinary` example question (Matt West).

  - Add `make` to the Docker container (Dave Mussulman).

  - Add more feedback when submission to `pl_symbolic_input` has invalid format (Tim Bretl).

  - Add live update of external grading results (Nathan Walters).

  - Add ability for user to switch between MATLAB and python format in `pl_matrix_output` (Tim Bretl).

  - Add copy-to-clipboard button in `pl_matrix_output` (Tim Bretl).

  - Add detailed question statistics (Paras Sud).

  - Add visible logging for incremental DB migrations (Matt West).

  - Add support for python format in `pl_matrix_input` (Tim Bretl).

  - Add student and instructor question links on instructor page (Matt West).

  - Add new python grading framework for exampleCourse (Nathan Walters).

  - Add CSV export of best (highest scoring) submissions (Matt West).

  - Add CSV download for instance questions (Matt West).

  - Split installing documentation into separate method sections (Matt West).

  - Remove unused dead code (`/lib/db.js`, `question-servers/shortAnswer.js`,
    and `tests/sync/*`) (Nathan Walters).

  - Remove cookie-clearing on error page (Matt West).

  - Remove old unused Python caller code (Tim Bretl).

  - Remove AWS Batch external grader (Nathan Walters).

  - Remove the need for `<pl_variable_score>` in questions (Tim Bretl).

  - Remove detailed AzureAD logging (Matt West).

  - Remove the need to return `data` in python functions (Tim Bretl).

  - Change `externalGradingOptions.files` to `.serverFilesCourse`
    (Nathan Walters).

  - Change Python question code timeout from 5 s to 20 s (Tim Bretl).

  - Change "Errors" tab to "Issues" (Matt West).

  - Change max DB connections from 10 to 100 (Matt West).

  - Shift most `exampleCourse` to the external `pl-template` repository.

  - Shift symbolic input parser to `lib/python_helper_sympy.py` (Tim Bretl).

  - Fix external graders with invalid submissions (Nathan Walters).

  - Fix handling of too-large file uploads (Matt West).

  - Fix rendering glitch in instructor question table (Matt West).

  - Fix instructor closing of assessment instances (Matt West).

  - Fix spurious "question is complete" bug (Tim Bretl).

  - Fix bug in sigfig method of comparison when correct answer is zero (Tim Bretl).

  - Fix bug in pl_file_upload where students could upload arbitrary files (Nathan Walters).

  - Fix render bug on exams for questions without points (Matt West).

  - Fix assessment authorization when mode is NULL (Matt West).

  - Fix bug that prevented scalars from being rendered by `pl_matrix_output` (Tim Bretl).

  - Fix bug that prevented unicode minus from being parsed by `pl_matrix_output` and `pl_number_input` (Tim Bretl).

  - Fix external grading score display when score is missing (Nathan Walters).

  - Fix handling of image pull fails for external grading (Nathan Walters).

  - Fix options for v3 questions (Jake Bailey).

  - Fix course element reloading on sync (Nathan Walters).

  - Fix course element file loading (Matt West).

  - Fix file downloads as zip for v2 questions (Matt West).

  - Fix exam instance error handling with broken variants (Tim Bretl).

  - Fix `pl_number_input` to allow suffix for units with `display=inline` (Tim Bretl).

  - Fix symbolic input parser to eliminate use of `sympy.sympify` (Tim Bretl).

  - Fix bug that prevented numbers from being converted in sympy equivalents in symbolic input parser (Tim Bretl).

  - Fix bug that prevented use of multiple symbols in `pl_symbolic_input` (Tim Bretl).

  - Fix inoperable "Test" buttons for non-v3 questions by hiding them (Matt West).

  - Fix inaccurate issue counts on assessments (Matt West).

  - Fix exam auto-closing issue with legacy assessment instances (Matt West).

  - Fix double-click handling on question buttons (Matt West).

  - Fix one broken exam from blocking other exams auto-closing (Matt West).

  - Fix v2 questions `clientCode` path on Exam assessments (Matt West).

  - Fix decreased Exams scores with reduced credit (Matt West).

  - Fix premature answer display for `pl_multiple_choice` and `pl_checkbox` (Matt West).

  - Fix broken popovers in student exam questions (Tim Bretl).

  - Fix canceling of grading jobs on a new submission (Matt West).

  - Fix symbolic expression parsing bug by disallowing floating-point numbers (Tim Bretl).

  - Fix handling of broken questions on Homeworks (Matt West).

  - Fix handling of `inf` and `nan` submissions in `pl_number_input` (Tim Bretl).

  - Fix server crash in grading job handling (Nathan Walters).

  - Fix a few very old submissions with NaN scores (Matt West).

  - Fix assessment re-open/close link rendering (Nathan Walters).

  - Fix null-byte handling in grader results (Nathan Walters).

  - Fix elements not reading their templates with UTF-8 encoding (Nathan Walters).

  - Fix display of assessment score to 2 decimal places (Nathan Walters).

  - Fix gradebook to choose best score rather than worst (Matt West).

  - Fix bug in `pl_number_input` that crashed on submission of large integers (Tim Bretl).

- **2.10.1** - 2017-05-24

  - Fix display of saved submissions for Exam assessments.

- **2.10.0** - 2017-05-20

  - Add real-time grading job status with websockets (Nathan Walters).

  - Add full DB schema migration system (Nathan Walters).

  - Add unit tests for DB migrations (Nathan Walters).

  - Add Python modules for autograders: `numpy`, `scipy`, `matplotlib`,
    `sympy`, and `pandas` (Jordi Paris Ferrer).

  - Add `scipy` and `numpy` to the PL docker image.

  - Add documentation on the new authentication flow.

  - Add more developer documentation on the database schema.

  - Add export of full database in CSV, optionally anonymized.

  - Use Python 3.5 for autograders in `exampleCourse` (Nathan Walters).

  - Fix docker build script usage help.

  - Fix base64 encoding of uploaded files.

- **2.9.1** - 2017-05-17

  - Fix handling of failed grading jobs (Nathan Walters).

- **2.9.0** - 2017-05-14

  - Add support for Google OAuth2 authentication.

  - Shift documentation to Read the Docs.

  - Fix handling of Unicode characters in question data.

- **2.8.0** - 2017-05-04

  - Add DB storage of exam mode networks.

  - Add `config` table to DB with system `display_timezone`.

  - Fix async handling in regrading unit tests.

- **2.7.0** - 2017-04-28

  - Add `/pl/webhooks/ping` endpoint for automated health checks.

  - Add `singleVariant` flag for non-randomized questions.

  - Add documentation and improve layout for external autograder files
    (Nathan Walters).

  - Add link to detailed instances CSV file on instructor assessment page.

  - Add more assessment CSV download options.

  - Allow development use of non-master git branches for courses.

  - Fix `max_points` update during regrading.

  - Fix env var security in autograder containers (Jordi Paris Ferrer).

  - Fix external autograder output display (Nathan Walters).

  - Fix home directory detection for external autograder jobs.

  - Fix rendering of table row lines in student question lists.

- **2.6.0** - 2017-04-16

  - Add full external autograder support with AWS and local docker support
    (Nathan Walters, Jordi Paris Ferrer).

- **2.5.3** - 2017-04-14

  - Fix docker build with `migrations/` directory.

- **2.5.2** - 2017-04-14

  - Fix regrading support.

- **2.5.1** - 2017-04-12

  - Fix Exam reservation enforcement when multiple reservations exist.

- **2.5.0** - 2017-04-11

  - Speed up rendering of instructor pages with assessment statistics.

  - Speed up calculation of assessment durations.

  - Speed up pages with job sequences.

  - Add per-day mean scores to the by-day score plot.

  - Add `points` and `max_points` output to assessment_instances CSV.

  - Add `migrations/` directory for ordered DB schema changes.

  - Fix assessment duration estimation for homeworks (1-hour gap maximum).

  - Fix CSV link on gradebook page.

  - Fix sorting of assessment on gradebook page.

  - Fix CSV download on instructor assessments overview page.

  - Fix date format in activity log CSV.

  - Fix links to questions on activity log pages.

  - Remove "permanent URL" on instructor assessments overview page.

- **2.4.1** - 2017-04-08

  - Set question `feedback` to the empty object when missing.

- **2.3.2** - 2017-04-08

  - Set question `feedback` to the empty object when missing.

- **2.4.0** - 2017-04-07

  - Add connection to PrairieSchedule to enforce Exam reservations.

  - Fix ordering of assessment set headers in assessment lists.

  - Fix duration calculations to be from assessment start to last submission.

  - Show all submissions in downloaded CSV files even in dev mode.

  - Fix `Manual` grading type (Jake Bailey).

  - Change `forceMaxPoints` to only take affect during an explicit regrade.

- **2.3.1** - 2017-03-23

  - Don't display deleted courses on the enroll (add/remove courses) page.

- **2.3.0** - 2017-03-08

  - Change `feedback` to be visible for open questions on exams.

  - Make `feedback` visible within `submission.html` (Ray Essick).

  - Fix auto-finishing of exams after a 6-hour timeout.

  - Add regrading support with `forceMaxPoints` option.

  - Add preliminary external autograder support by the HackIllinois team
    (Genna Helsel, Teju Nareddy, Jordi Paris Ferrer, Nathan Walters).

  - Add question points and percentage scores to `*_final_submissions.csv`.

  - Add per-day score histograms to instructor assessment page (Paras Sud).

- **2.2.2** - 2017-02-23

  - Add more indexes and improve unique constraint ordering for indexes.

- **2.2.1** - 2017-02-18

  - Only show feedback for open exams in CS 233.

- **2.2.0** - 2017-02-18

  - Show feedback for graded questions on exams, even if exam is
    still open (Jake Bailey).

- **2.1.3** - 2017-02-17

  - Prevent multiple submissions to a single homework question variant.

  - Fix option passing to question server.js functions.

  - Fix course deletion on Admin page.

- **2.1.2** - 2017-02-15

  - Catch bad Shibboleth authentication data with "(null)" UID.

  - Fix logging of `instance_question_id` in response.

- **2.1.1** - 2017-02-13

  - Update ChangeLog.

- **2.1.0** - 2017-02-13

  - Fix division-by-zero error in homeworks when `max_points` is zero
    (Jake Bailey).

  - Fix typos in documentation (Andre Schleife).

  - Fix MTF questions.

  - Fix assessment links on Instructor Gradebook page.

  - Fix XSS vulnerability by storing `questionJson` in base64.

- **2.0.3** - 2017-02-04

  - Cache `instance_questions.status` to speed up page loads.

- **2.0.2** - 2017-02-04

  - Speed up SQL query in `instance_questions` authorization.

- **2.0.1** - 2017-01-28

  - Fix incorrect `max_points` for homeworks with question alternatives.

- **2.0.0** - 2017-01-13

  - Make v2 the primary version and shift the old v1 to a subdirectory.

  - Add support for syncing a course from a remote git repository.

  - Add dev mode with local disk syncing and other dev features.

  - Convert score_perc to double (instead of integer).

  - Add UUIDs to all input JSON files to support renaming.

  - Convert all DB tables to bigserial primary keys.

  - Add docker build for course development.

  - Add question difficulty vs discrimination plots (Paras Sud).

  - Add 'Administrator' users will full site access.

  - Standardize names of JSON files and client/server file directories.

  - Clean up JSON file formats for everything except questions.

  - Add documentation for all v2 file formats.

  - Add conversion script from v1 to v2 assessment format (Dallas Trinkle).

- **1.22.0** - 2016-12-09

  - Add IP ranges for final exams in DCL.

  - Fix docker instructions (Allen Kleiner).

  - Skip update of test instances for non-existent tests.

  - Fix crashing bug due to function call typo (Kevin Wang).

  - Don't attempt to generate statistics for non-existent questions.

  - Improve robustness of `submittedAnswer` restore for Fabric.js questions.

  - Add `fixedExponential` formatter.

  - Add raw score (full precision) to CSV downloads.

  - Fix logging error (Eric Huber).

  - Generate hi-res versions of LaTeX images for Fabric.js support.

  - (V2) Enable assessments with multiple instances per student.

  - (V2) Fix submission rendering for admin question views (Ray Essick).

  - (V2) Add past submissions view on exam question pages (Ray Essick).

  - (V2) Add underlying support for external (RabbitMQ) and manual grading.

  - (V2) Fix grading operations outside the main transaction.

  - (V2) Add question alternatives within assessments.

  - (V2) Implement generic CSRF protection for all pages.

  - (V2) Split site into Admin and User pages.

  - (V2) Add unified homepage with course list and self-enrollment.

  - (V2) Fix SQL import newline handling on Windows.

  - (V2) Add docker build.

  - (V2) Add admin view of individual assessment instances.

- **1.21.0** - 2016-09-14

  - Use hi-res time for random seeds, improving test randomization.

  - Improve margins around `Save answer` buttons (Eric Huber).

  - Improve sorting of tests with identical numbers to sub-sort on titles.

  - Fix handling of question shuffling within tests (Binglin Chen).

  - Fix user role reading from `courseInfo.json`.

  - Fix error-handling code in `POST /submissions`.

  - Remove Siebel 0224 from `Exam` mode (Jeffrey Tolar).

  - (V2) Automatically regenerate assessment statistics every 10 minutes.

  - (V2) Fix CSV statistics downloads.

  - (V2) Switch to local copy of MathJax.

  - (V2) Implement access date display.

  - (V2) Implement `Exam` and `Homework` assessment types.

- **1.20.0** - 2016-08-24

  - Fix `jsPlumb` naming case (Jeffrey Tolar).

  - Remove `/export.csv` endpoint (Kevin Wang).

  - Explicitly specify dependency versions in `package.json` (Kevin Wang).

  - Validate effective UID before creating tInstances (Kevin Wang).

  - Fix display of `trueAnswers` for all questions (Kevin Wang).

  - Document the Reload button (Jeffrey Tolar).

  - Fix role changing restrictions (Jeffrey Tolar).

  - Improve naming of exam grade/finish buttons and modal texts (Kevin Wang).

  - Show zone titles within tests (Jeffrey Tolar).

  - Remove current exam score from sidebar (Kevin Wang).

  - Split out helper modules from server code (Jeffrey Tolar).

  - Warn user when exam has unanswered questions (Kevin Wang).

  - Improve user feedback when all exam questions are answered (Kevin Wang).

  - Fix viewport width handling (Jeffrey Tolar).

  - Upgrade to ExpressJS 4.x.

  - Disallow multiple submissions for a single homework question instance (Kevin Wang).

  - Fix all server-side error handling to use standard NodeJS convention (Kevin Wang).

  - Fix race condition on client initialization (Jeffrey Tolar).

  - Improve server-side RequireJS usage (Jeffrey Tolar).

  - Add submissions directly from the command line (Kevin Wang).

  - Improve docs for Windows installations (Dave Mussulman).

  - Expose `PLConfig` to backend to access server URL (Kevin Wang).

  - Fix crash on `GET /clientFiles/` (Kevin Wang).

  - Fix handling of large git pulls of class data (Jeffrey Tolar).

  - Fix `mtfclient` to properly handle checkbox listening (Terence Nip).

  - Fix percentage score exports.

  - Switch exam-mode IP blocks to new CBTF location in Grainger.

  - Add new drawing commands for LShape, TShape, DistLoad (Mariana Silva).

  - Store latex text images per-course rather than globally.

  - Add homework random shuffle mode with global question numbers (Binglin Chen).

  - (V2) Add experimental backend using PostgresQL and server-side rendering.

- **1.19.0** - 2016-02-23

  - Add Ace editor for in-question code editing (Terence Nip).

  - Add `MultipleTrueFalse` question type (Terence Nip).

  - Upgrade MathJax to 2.6.0 to fix "vertical bar" rendering problem.

  - Add `adm-zip` support for questions to create zip files (Craig Zilles).

  - Enable embedded images in MultipleChoice and Checkbox question types.

  - Fix bugs related to reporting of PrairieLearn git version.

  - Add Errors tab for instructors to see server-side errors, and report more errors.

  - Add Reload button in development mode.

  - Add support for variable credit on tests (bonus credit and partial credit).

  - Remove the Adaptive test type (superseded by Game).

  - Add validation for dates on server load.

  - Fix display of question answer feedback during RetryExams.

  - Change all test scores to be stored as percentages without decimal places (rounded down).

  - Add `{{params.a | vector}}` template for bracketed vectors.

  - Support IP range checking for Siebel basement labs.

- **1.18.0** - 2016-01-20

  - Fix security hole to restrict question access to accessible tests.

  - Add `jsplumb` support (Terence Nip).

- **1.17.0** - 2015-11-04

  - Fix missing `questionFile()` caused by upgraded underscore templating.

  - Fix sorting of tests with mixed integer/string numbers.

  - Fix broken PrairieDraw figures after submission grading.

  - Fix role changes on User page with Firefox.

  - Fix username setting when UID is set.

  - Fix User page dropdowns to default to current state.

  - Add a User page button to change back to the authenticated UID.

  - Fix missing user list in dropdown after UID change.

  - Add "Troubleshooting" documentation page with frequently asked questions.

  - Add documentation about tests and questions versus test instances and question instances.

  - Add `Checkbox` question type.

  - Add `exampleCourse/questions/randomZip` example.

  - Remove unused `backend/questions` and `backend/tests` templates in favor of `exampleCourse`.

  - Include MathJax inside PrairieLearn.

  - Fix TeX label generation scripts to support Python 3.X and `courseDir` config variable.

- **1.16.1** - 2015-10-12

  - Fix alignment of date plots on Safari.

- **1.16.0** - 2015-10-12

  - Link questions on test "Admin" pages to question instances.

  - Add statistics by day for exam-type tests.

- **1.15.2** - 2015-10-09

  - Fix doc references from "Assessment Detail" to assessment "Admin" page.

- **1.15.1** - 2015-10-08

  - Clean up `particleMotion` example HTML templates.

- **1.15.0** - 2015-10-08

  - Enable feedback in questions during exams and add `particleMotion` example.

- **1.14.1** - 2015-10-08

  - Fix documentation typo in test access control section.

- **1.14.0** - 2015-10-08

  - Add "uids" as an access rule restriction in test "allowAccess".

- **1.13.2** - 2015-10-08

  - Use a locally-hosted copy of MathJax.

- **1.13.1** - 2015-10-04

  - Fix test statistics for `Exam` and `PracExam` tests.

- **1.13.0** - 2015-10-04

  - Plot score histogram in test admin view (Binglin Chen @chen386).

  - Add question statistics to test admin view.

  - Display PrairieLearn version number on the Sync page.

- **1.12.1** - 2015-09-24

  - Fix test statistics for `RetryExam` using zones.

- **1.12.0** - 2015-09-24

  - Standardize question numbering to be like #3.8 rather than #3-8 (Terence Nip @tnip).

  - Fix schema validation and example for RetryExams with multiple qids in a question.

- **1.11.1** - 2015-09-23

  - Fix build bug with missing moment-timezone.

  - Remove deprecation warning for `questionGroups` in `RetryExam`.

- **1.11.0** - 2015-09-23

  - Redesign of the "Assessment" page to be more compact and consistent.

  - Add `zones` to `RetryExam` to control question-order randomization.

  - Add `variantsPerQuestion` and `unlimitedVariants` options for `RetryExam`.

  - Improve test naming consistency and fix navbar link bugs with tests.

  - Allow test numbers to be strings.

- **1.10.2** - 2015-09-19

  - Fix bug introduced by 1.10.1 that broke all tests (overly general change events).

- **1.10.1** - 2015-09-18

  - Fix bug that caused the "User" page to not display changes in user, role, or mode.

- **1.10.0** - 2015-09-15

  - Add "reset test" capability for instructors.

  - Only allow questions to be solved for accessible tests.

  - Add export test data capability for instructors.

  - Add summary test statistics for instructors.

- **1.9.1** - 2015-09-11

  - Fix docs/example to add blank target for test text links.

  - Fix `clientFiles` to also handle subdirectories.

- **1.9.0** - 2015-09-11

  - Add `clientFiles` and docs for adding text/files to tests.

- **1.8.1** - 2015-09-10

  - Fix security hold where anyone could access `/export.csv`.

- **1.8.0** - 2015-09-09

  - Add optional header text for `RetryExam` (for formula sheets, etc).

- **1.7.6** - 2015-09-09

  - Load frontend website even if there were errors fetching data.

- **1.7.5** - 2015-09-07

  - Reload all question `server.js` files after "Sync" with a git course repository.

- **1.7.4** - 2015-09-06

  - Correctly give highest score for assessments with duplicate scores.

- **1.7.3** - 2015-09-06

  - Fix bug that created multiple tInstances.

- **1.7.2** - 2015-09-02

  - Fix `exampleCourse/questions/addVectors` to use `QServer` so `gradeAnswer()` is truly optional.

- **1.7.1** - 2015-09-02

  - Fix schema links in documentation.

  - Add documentation for question options.

  - Add docs and text on the User page to describe the server `mode` in more detail.

- **1.7.0** - 2015-09-01

  - Don't generate new question variants until the old variant is answered.

- **1.6.0** - 2015-09-01

  - Make `exampleCourse/tests/homework1` visible by default.

  - Display course name in page title.

  - Use "assessment" rather than "homework" or "test" in user-visible strings.

- **1.5.2** - 2015-08-31

  - Fix example `backend/config.json` in the docs.

- **1.5.1** - 2015-08-30

  - Clarify docs about user role setting.

- **1.5.0** - 2015-08-26

  - Enable exam mode detection via hard-coded IP range for the CBTF.

- **1.4.1** - 2015-08-26

  - `export.csv` now uses test `set` rather than `type` for test names.

- **1.4.0** - 2015-08-25

  - Add documentation and help text for Sync page.

  - Fix display of commit information when using older versions of git.

  - Add figure to example question `addVectors` in `exampleCourse`.

- **1.3.2** - 2015-08-24

  - Fix `allowAccess` checks to not always fail.

- **1.3.1** - 2015-08-24

  - Fix `pulls` error when `gitCourseBranch` is not set.

- **1.3.0** - 2015-08-24

  - Change default `allowAccess` to block all non-instructor access.

- **1.2.1** - 2015-08-24

  - Fix race condition in user creation and correctly record user names.

- **1.2.0** - 2015-08-23

  - Add "Sync" feature to pull from a git repository.

  - Fix missing `template` field in `config.json` schema.

  - Improve error logging with more specific error information.

- **1.1.0** - 2015-08-22

  - Add access logging to the database.

- **1.0.2** - 2015-08-19

  - Documentation fixes following the bootcamp.

  - Fix undefined logger error if `config.json` contains errors (reported by Craig and Mariana).

- **1.0.1** - 2015-08-18

  - Fix `npm` module list during bootcamp (remove `nodetime`, add `moment`).

- **1.0.0** - 2015-08-18

  - First public release for pre-Fall-2015 bootcamp.
