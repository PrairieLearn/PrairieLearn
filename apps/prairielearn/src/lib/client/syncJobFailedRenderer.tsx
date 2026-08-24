/** Renders a sync-job failure with a link to PrairieLearn's job logs. */
export function syncJobFailedRenderer(urlPrefix: string) {
  return ({ message, jobSequenceId }: { message: string; jobSequenceId: string }) => (
    <>
      {message} <a href={`${urlPrefix}/jobSequence/${jobSequenceId}`}>View job logs</a>
    </>
  );
}
