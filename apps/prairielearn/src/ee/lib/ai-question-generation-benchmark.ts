import { config } from '../../lib/config.js';
import { createServerJob } from '../../lib/server-jobs.js';

export async function benchmarkAiQuestionGeneration({
  authnUserId,
}: {
  authnUserId: string;
}): Promise<string> {
  // Safety check: for now, we really only want this to run in dev mode.
  if (!config.devMode) {
    throw new Error('AI question generation benchmarking is only available in dev mode');
  }

  const serverJob = await createServerJob({
    type: 'ai_question_generation_benchmark',
    description: 'Benchmark AI question generation',
    authnUserId,
  });

  serverJob.executeInBackground(async (job) => {});

  return serverJob.jobSequenceId;
}
