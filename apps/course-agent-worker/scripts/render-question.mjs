import { randomUUID } from 'node:crypto';
import { setTimeout } from 'node:timers/promises';

export async function requestQuestionRender(input) {
  const body = JSON.stringify({ ...input, id: randomUUID() });
  const deadline = Date.now() + 180_000;
  while (Date.now() < deadline) {
    const response = await fetch('http://course-agent.internal/render-question-variant', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      signal: AbortSignal.timeout(10_000),
    });
    const pending = await response.json();
    if (!response.ok) throw new Error(pending.error ?? 'Could not render the synced question');
    if (pending.result) return pending.result;
    await setTimeout(1000);
  }
  throw new Error(
    'PL did not return a render result within three minutes. This question has not been validated.',
  );
}
