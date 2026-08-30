import { onDocumentReady } from '@prairielearn/browser-utils';

onDocumentReady(async () => {
  const outputUrl = document.getElementById('job-output')?.dataset.outputUrl;

  // If the output URL is not defined, the output is already included in the
  // page, so we don't need to fetch it.
  if (outputUrl) {
    const output = await fetch(outputUrl, {
      // If the load triggers an error, we want the error in JSON format.
      headers: { accept: 'text/plain, application/json' },
    }).catch(() => ({ ok: true, text: async () => 'Unable to load grader results' }));

    let outputText = await output.text();
    if (!output.ok) {
      try {
        const outputJson = JSON.parse(outputText);
        if (typeof outputJson === 'object' && outputJson !== null && 'error' in outputJson) {
          outputText = outputJson.error;
        }
      } catch {
        // In case of JSON parse errors, use original text
      }
      outputText = `Error: ${outputText || 'Unknown error'}`;
    }

    document.getElementById('job-output-loading')?.classList.add('d-none');
    const jobOutputElement = document.getElementById('job-output');
    if (jobOutputElement != null) {
      jobOutputElement.textContent = outputText;
      jobOutputElement.classList.remove('d-none');
    }
  }
});
