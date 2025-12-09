import clsx from 'clsx';

import { ansiToHtml } from '../lib/chalk.js';

export function SyncErrorsAndWarnings({
  authzData,
  exampleCourse,
  syncErrors,
  syncWarnings,
  fileEditUrl,
  context,
}: {
  authzData: { has_course_permission_edit: boolean };
  exampleCourse: boolean;
  syncErrors: string | null;
  syncWarnings: string | null;
  fileEditUrl: string;
  context: 'course' | 'question' | 'course instance' | 'assessment';
}) {
  if (!authzData.has_course_permission_edit) {
    return null;
  }
  if (!syncErrors && !syncWarnings) {
    return null;
  }

  const syncErrorsAnsified = syncErrors ? ansiToHtml(syncErrors) : null;
  const syncWarningsAnsified = syncWarnings ? ansiToHtml(syncWarnings) : null;
  const infoFileName = fileEditUrl.split('/').pop();

  return (
    <>
      {syncErrors ? (
        <div class="alert alert-danger" role="alert">
          <h2 class="h5 alert-heading">Sync error</h2>
          <p>
            There was an error syncing this {context}; the information you see below may be
            inconsistent with this {context}'s <code>{infoFileName}</code> file. Please correct the
            error and sync again.
          </p>
          <pre
            class={clsx('text-white', 'rounded', 'p-3', exampleCourse && 'mb-0')}
            style="background-color: black;"
          >
            {syncErrorsAnsified && (
              /* eslint-disable-next-line @eslint-react/dom/no-dangerously-set-innerhtml */
              <code dangerouslySetInnerHTML={{ __html: syncErrorsAnsified }} />
            )}
          </pre>
          {exampleCourse ? (
            ''
          ) : (
            <a class="btn btn-primary" href={fileEditUrl}>
              <i class="fa fa-edit" />
              <span class="d-none d-sm-inline">Edit {infoFileName} to fix this error</span>
            </a>
          )}
        </div>
      ) : (
        ''
      )}
      {syncWarnings ? (
        <div class="alert alert-warning" role="alert">
          <h2 class="h5 alert-heading">Sync warning</h2>
          <p>
            These warnings do not impact the ability to sync this {context}, but they should still
            be reviewed and corrected.
          </p>
          <pre
            class={clsx('text-white', 'rounded', 'p-3', exampleCourse && 'mb-0')}
            style="background-color: black;"
          >
            {syncWarningsAnsified && (
              /* eslint-disable-next-line @eslint-react/dom/no-dangerously-set-innerhtml */
              <code dangerouslySetInnerHTML={{ __html: syncWarningsAnsified }} />
            )}
          </pre>
          {exampleCourse ? (
            ''
          ) : (
            <a class="btn btn-primary" href={fileEditUrl}>
              <i class="fa fa-edit" />
              <span class="d-none d-sm-inline">Edit {infoFileName} to fix this warning</span>
            </a>
          )}
        </div>
      ) : (
        ''
      )}
    </>
  );
}
