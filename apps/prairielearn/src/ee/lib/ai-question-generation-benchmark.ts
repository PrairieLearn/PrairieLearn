import path from 'node:path';

import type { OpenAIResponsesProviderOptions } from '@ai-sdk/openai';
import { type LanguageModel, generateObject } from 'ai';
import { execa } from 'execa';
import fs from 'fs-extra';
import * as tmp from 'tmp-promise';
import { z } from 'zod';

import { type OpenAIModelId, formatPrompt } from '../../lib/ai-util.js';
import { b64DecodeUnicode } from '../../lib/base64-util.js';
import { config } from '../../lib/config.js';
import { getCourseFilesClient } from '../../lib/course-files-api.js';
import { type User } from '../../lib/db-types.js';
import { features } from '../../lib/features/index.js';
import { createServerJob, getJobSequence } from '../../lib/server-jobs.js';
import { insertCourse } from '../../models/course.js';
import { syncDiskToSql } from '../../sync/syncFromDisk.js';
import { selectAiQuestionGenerationMessages } from '../models/ai-question-generation-message.js';

import { editQuestionWithAgent, getAgenticModel } from './ai-question-generation/agent.js';

interface Benchmark {
  prompt: string;
}

export const QUESTION_BENCHMARKING_OPENAI_MODEL = 'gpt-5-2025-08-07' satisfies OpenAIModelId;

const BENCHMARKS: Benchmark[] = [
  // These are high-quality prompts written or reviewed by a PrairieLearn expert.
  {
    prompt:
      'Write a question that asks the user to multiply two integers. You should randomly generate two integers A and B, display them to the user, and then ask the user to provide the product C = A * B. Provide an integer input box for the user to enter the product. The correct answer is the product of A and B.',
  },
  {
    prompt:
      'Write a question that asks the user to calculate the area of a rectangle given fixed dimensions. Provide a numeric input box for the user to enter the area. The correct answer is the product of the rectangle dimensions.',
  },
  {
    prompt:
      'Write a question that asks the user to identify which of four planets is the third from the sun. The order of planets should be randomized. Provide a multiple-choice radio button input with four options, including one correct answer and three distractors. The correct answer is "Earth" for this scenario, based on its distance from the sun.',
  },
  {
    prompt:
      'Write a question that asks the user to calculate the greatest common divisor (GCD) of two integers A and B. Randomly generate integers A and B. Provide an integer input box for the user to enter the GCD. The correct answer is the GCD of the two randomly generated integers A and B.',
  },
  {
    prompt:
      'Write a question that asks the user to select all prime numbers from a given list of integers. Randomly generate the list to include both primes and non-primes. Provide a checkbox input for the user to select multiple answers. The correct answers are all prime numbers in the generated list.',
  },
  {
    prompt:
      'Write a question that asks the user to convert a randomly generated angle from radians to degrees. Provide a numerical input box for the user to enter the degree equivalent. The correct answer is the degree equivalent of the given angle in radians.',
  },
  {
    prompt:
      'Generate a random polynomial of the form ax + b = c. Ask the student to solve for x. Provide a numerical input box for the user to enter the solution. The correct answer is the solution for x (x = (c - b) / a).',
  },
  {
    prompt:
      'Write a question that asks the user to calculate the number of moles given a random mass of a substance and its molar mass. Randomly generate the mass and molar mass. Provide a numeric input box for the user to enter the number of moles. The correct answer is the calculated number of moles using (mass / molar mass).',
  },
  {
    prompt:
      'Write a question that asks the user to calculate the pressure of a gas using the ideal gas law PV = nRT. Randomly generate values for n, V, T, and R. Provide a numeric input box for the user to enter the pressure in atmospheres. The correct answer is the pressure calculated using the ideal gas law.',
  },
  {
    prompt:
      'Write a question that asks the user to calculate the pH of a solution given the concentration of hydrogen ions [H+]. Randomly generate the concentration; use physically realistic values. Provide a numeric input box for the user to enter the pH value. The correct answer is -log10([H+]) for the given concentration of hydrogen ions.',
  },
  // These are prompts from actual user studies. They have been lightly edited
  // for correctness in case of egregious errors, but are otherwise unmodified.
  {
    prompt:
      'A toy car is pushed off a table with height h at speed v0. Assume acceleration due to gravity as 9.81 m/s^2. H is a number with 1 decimal digit selected at random between 1 and 2 meters. V0 is a an integer between 1 and 4 m/s. How long does it take for the car to reach the ground? students should enter the solution using a decimal number. The answer should be in seconds. the answer is computed as sqrt(2 * h / g) where g = 9.81 m/s^2',
  },
  {
    prompt:
      'sum two randomly generated numbers from 0 to 100, each with two decimal digits. students should input their solution as decimal number, and correctness should be checked using a relative tolerance of 1e-3. the correct answer is the summation of the two numbers provided in the question prompt',
  },
  {
    prompt:
      'In humans, a single glucose molecule generates x ATP during glycolysis, and the Krebs cycle produces an additional y ATP. The electron transport chain generates approximately z ATP. What is the total number of ATP molecules produced from the complete breakdown of one glucose molecule in aerobic respiration? Create a question where x, y, z are integer numbers randomly selected. x and y vary between 2 and 4, z varies between 30 and 40. students should enter their answer as an integer. the correct answer is x+y+z',
  },
  {
    prompt:
      'for a vehicle starting from stopped and accelerating at a given rate (A), for a given amount of time (t), find the position and velocity after that amount of time has passed. Initial position x0, velocity v0 are given. inputs should be a float for x and v (position and velocity). x(t) = x0+v0*t+1/2At^2 and v(t) = v0+A*t',
  },
  {
    prompt:
      'given a specimen subjected to an applied deformation, initial length is x0 final length is xf, elastic modulus is E, find the stress induced in the material. use units of Newtons and meters. student input should be a float that represents the stress in MPa. correct answer is E*(xf-x0)/x0',
  },
  {
    prompt:
      'given a mass (M) on a spring of stiffness (K) with an initial position (x), velocity (xdot) and acceleration (xddot) write a symbolic expression for the kinetic and potential energy of the system. student input should be symbolic expressions. kinetic energy is 1/2*m*xdot^2. potential energy is 1/2*k*x^2',
  },
  {
    prompt:
      'An initial population of size Xi reaches a size Xf after N years. Find the size of the population after Ny years, where Ny = alpha*N and alpha is an integer greater than 1. Xi is an integer between 100 and 300, Xf is an integer between 400 and 500, N is an integer number of years between 1 and 5 inclusive. The student should enter the answer into a box using a decimal number. The final answer should be labeled Y. The final answer Y is Y = Xi*(Rate^(Ny/N)), where Rate = Xf/Xi',
  },
  {
    prompt:
      'we want to determine the concentration of a drug at any given time. The students are given an initial drug concentration "C0" which will be an integer randomly selected between 200 and 700. They will also be given a decay constant which will be an integer randomly selected from between 0 and 11.  Students will also be given a value "N" which is an integer between 2 and 10. The students should be given a single output box where they can put in "t" the decimal form of the number of hours until the concentration reaches the desired level. The correct answer will be computed using t=-ln(1/N)/k',
  },
  {
    prompt:
      'Given positive integers a and b, find the price P given demand D. a and b should be positive integers, and D should also be a positive integer. Students should input the answer, labeled P, as a decimal. The answer input box should have units of "units". the correct answer is P = (a-D)/b',
  },
  {
    prompt:
      'We want to make a solid mechanics question where we find the tensile stress "S" (measured in MPA) in a beam. We are given the initial length of the beam, X0 (an integer between 30 and 100) with units mm. The students are also given XF, the final length of the beam. xf is x0+delta where delta is a decimal between .01 and .09 mm. The last piece of information students are given is E, the modulus of elasticity, which is an integer between 50 and 300, measured in GPA. Students should submit their answer, "S", as a single decimal number. S=E*(xf-xi)/xi',
  },
  {
    prompt:
      'Consider the indefinite integral of a*x^b dx. Given positive integers a and b, find the correct symbolic representation of the integral, labeled Y. Choose from a multiple choice list. The students should choose the right answer form a set of multiple choice options. The correct answer is Y = (a/(b+1))*x^(b+1) + C. The four distractors should be Y = x^(b+1) + C, (a/(b+1))*x^(b+1), a*x^(b+1), and ((a * (b+1))/b)*x^b.',
  },
  {
    prompt:
      'We want students to identify the number of degrees of freedom in a mechanism. The students will be given the number of links in the mechanism, L=(4 or 6). They will also be given the number of full joints J1=(0,1,2,3,4) and the number of half joints J2=(0,1,2). T. This is a multiple choice question, with students able to select "less than 0", "0","1","2", or "more than 2 The correct number of degrees of freedom are 3(L-1)-2*J1-J2',
  },
  {
    prompt:
      'A dog bone specimen is stretched from initial length x0 to final length xf using applied tensile stress S on either side. Find the stress necessary to elongate the specimen from an initial length x0 to the final length xf. The initial length of the specimen x0 is a random integer from 30-100 mm. The elongation of the specimen, delta, is random and ranges from 0.1 to 0.9 mm and is a multiple of 0.01. The modulus of elasticity, E, is a random integer from 50-300 GPa. Students should enter the solution using a decimal number. The answer should be in MPa. S = E*(xf-x0)/x0',
  },
  {
    prompt:
      'Determine the final velocity and position of a car starting from an initial position, x0 = 0 meters and an initial velocity of v0 = 0 meters per second and moving with an acceleration af which is a randomized integer between 2 and 5 meters per second after a total elapsed time tf which is a randomized integer between 2 and 20 seconds. Students should enter two solutions using decimal numbers. They should first enter an answer for the velocity at time tf in meters per second and then should enter an answer for the position at time tf in meters. The answer for the velocity at time tf is computed as v0 + a * t for the velocity, where t = tf, a = af, and v0 = 0. The answer for the position at time tf is computed as x0 + v0*t + 0.5*a*t^2, where t = tf, a = af, v0 = 0, and x0 = 0.',
  },
  {
    prompt:
      'Compute the mean of a list of N random integer numbers between 0 and 20, where N is an integer randomly chosen between 5 and 10. Students should input a decimal number for the mean of the set of numbers in N. The answer is computed by adding all the numbers in the list of N together and dividing by the number of values in list N.',
  },
  {
    prompt:
      "A big medicine company is creating a new drug and needs to determine how much of the drug is left in someone's system given its exponential decay. We know the initial concentration of the drug, C0, and the decay constant k. How long will it take for the drug to drop below 1/N of its initial concentration (solve for time t in hours)? The initial concentration C0 is a random number with 1 decimal digit from 200-700 mg. k is a random number with three decimal places from 0-1 1/hour. N is a random integer from 3-7. Students should enter the solution t using a decimal number with 4 decimal points. The answer should be in hours. t = -ln(1/N)/k",
  },
  {
    prompt:
      'Determine the dot product of two vectors A and B. Let A be a vector x i_hat + y j_hat, where x is a given integer randomly chosen between 0 and 5 and y is a given integer randomly chosen between 0 to 5. Let B be a vector w i_hat + z j_hat, where w is a given integer randomly chosen between 0 and -5 and z is a given integer randomly chosen between 0 and -5. Students should enter an integer value for A dot B. The correct answer is equal to x*w + y*z.',
  },
  {
    prompt: 'sum a + b. integer. c = a + b.',
  },
  {
    prompt:
      'A car is accelerating forward with acceleration a (ranging from 2 to 5, with precision .1), with initial velocity and position = 0. Find the position and velocity of the car after elapsed time t (integer from 2 to 20). 2 numerical input boxes. v = v0 + a*t, x = x0 + v0*t + 1/2*a*t^2',
  },
  {
    prompt:
      'Find the population of rabbits given an exponential growth model. Generate a value of alpha (scalar integer), N in years, Xi = initial population, and Xf = population after N years. Find the population after alpha*N years. numerical input box. Y = Xi*(Xf/Xi)^alpha',
  },
  {
    prompt:
      'A toy car is pushed off a table with height h at speed v0. Assume acceleration due to gravity as 9.81 m/s^2. H is a number with 1 decimal digit selected at random between 1 and 2 meters. V0 is a an integer between 1 and 4 m/s. How long does it take for the car to reach the ground?. students should enter the solution using a decimal number. The answer should be in seconds. the answer is computed as sqrt(2 * h / g) where g = 9.81 m/s^2',
  },
];

const QuestionGenerationEvaluationSchema = z.object({
  score: z
    .number()
    .min(1)
    .max(5)
    .describe('Score the generated question from 1 (lowest) to 5 (highest).'),
  reasoning: z.string().array().describe('Provide your reasoning for the score.'),
});
type QuestionGenerationEvaluation = z.infer<typeof QuestionGenerationEvaluationSchema>;

export async function benchmarkAiQuestionGeneration({
  evaluationModel,
  user,
}: {
  evaluationModel: LanguageModel;
  user: User;
}): Promise<string> {
  // Safety check: for now, we really only want this to run in dev mode.
  if (!config.devMode) {
    throw new Error('AI question generation benchmarking is only available in dev mode');
  }

  const serverJob = await createServerJob({
    type: 'ai_question_generation_benchmark',
    description: 'Benchmark AI question generation',
    userId: user.id,
    authnUserId: user.id,
  });

  serverJob.executeInBackground(async (job) => {
    // We'll create a new course in a temporary directory. This will allow us
    // to preview any generated questions in the UI.
    const courseDirectory = await tmp.dir({
      prefix: 'ai-question-generation-benchmark-',
    });

    // The course must be a git directory for editing to work correctly.
    await execa('git', ['init'], { cwd: courseDirectory.path });

    // Populate an initial `infoCourse.json` file.
    const courseTitle = `AI Question Generation Benchmark ${Date.now()}`;
    const courseName = `ai-question-generation-benchmark-${Date.now()}`;
    await fs.writeJson(path.join(courseDirectory.path, 'infoCourse.json'), {
      uuid: crypto.randomUUID(),
      name: courseName,
      title: courseTitle,
      topics: [],
    });
    await execa('git', ['add', 'infoCourse.json'], { cwd: courseDirectory.path });
    await execa('git', ['commit', '-m', 'Initial commit'], { cwd: courseDirectory.path });

    const course = await insertCourse({
      institution_id: '1',
      // Use the unix timestamp as a suffix to make it unique.
      short_name: courseName,
      title: courseTitle,
      display_timezone: 'America/Chicago',
      path: courseDirectory.path,
      repository: null,
      branch: 'master',
      authn_user_id: user.id,
    });

    // Sync the course to the database so future edits will do their thing.
    job.info('Syncing course to database');
    const syncResult = await syncDiskToSql(course.id, course.path, job);
    if (syncResult.status !== 'complete' || syncResult.hadJsonErrorsOrWarnings) {
      // Sync should never fail when creating a brand new course, if we hit this
      // then we have a problem.
      job.fail('Failed to sync course to database');
      return;
    }

    // Enable the feature flag for this new course.
    await features.enable('ai-question-generation', {
      institution_id: '1',
      course_id: course.id,
    });

    const evaluationResults: QuestionGenerationEvaluation[] = [];

    for (const benchmark of BENCHMARKS) {
      // Generate a single question.
      const { model, modelId } = getAgenticModel();
      const result = await editQuestionWithAgent({
        model,
        modelId,
        course,
        user,
        authnUser: user,
        hasCoursePermissionEdit: true,
        prompt: benchmark.prompt,
      });

      // Wait for the job sequence to complete.
      await result.promise;

      const messages = await selectAiQuestionGenerationMessages(result.question);

      if (messages.length !== 2) {
        job.error(
          `Expected exactly two messages for question ${result.question.id}, got ${messages.length}`,
        );
        continue;
      }

      const userMessage = messages[0];
      const assistantMessage = messages[1];

      if (userMessage.role !== 'user') {
        job.error(`No user message found for question ${result.question.id}`);
        continue;
      }

      if (assistantMessage.role !== 'assistant') {
        job.error(`No assistant message found for question ${result.question.id}`);
        continue;
      }

      // Log the assistant message for debugging.
      job.info('Assistant message');
      job.info('=================');
      job.info(JSON.stringify(assistantMessage, null, 2));
      job.info('\n');

      const jobSequence = await getJobSequence(result.jobSequenceId, course.id);
      if (jobSequence.status === 'Error') {
        job.error(`Job sequence ${result.jobSequenceId} failed`);
      }

      // Fetch the generated question files.
      const client = getCourseFilesClient();
      const questionFilesResult = await client.getQuestionFiles.query({
        course_id: course.id,
        question_id: result.question.id,
      });

      const html = questionFilesResult.files['question.html']
        ? b64DecodeUnicode(questionFilesResult.files['question.html'])
        : '';
      const python = questionFilesResult.files['server.py']
        ? b64DecodeUnicode(questionFilesResult.files['server.py'])
        : '';

      const evaluationResult = await evaluateGeneratedQuestion({
        model: evaluationModel,
        assistantMessageContents: JSON.stringify(assistantMessage.parts, null, 2),
        userMessageContents: JSON.stringify(userMessage.parts, null, 2),
        html,
        python,
      });
      job.info('Evaluation result');
      job.info('=================');
      if (!evaluationResult) {
        job.error('No evaluation result returned.');
      } else {
        evaluationResults.push(evaluationResult);
        job.info(`Score: ${evaluationResult.score}`);
        job.info('Reasoning:');
        for (const line of evaluationResult.reasoning) {
          job.info(line);
        }
      }
      job.info('');
    }

    const scores = evaluationResults.map((result) => result.score);
    const minScore = Math.min(...scores);
    const maxScore = Math.max(...scores);
    const totalScore = scores.reduce((sum, score) => sum + score, 0);
    const avgScore = totalScore / scores.length;
    const totalPoints = scores.length * 5;

    job.info('==================');
    job.info('Benchmark complete');
    job.info(`Min score: ${minScore}`);
    job.info(`Max score: ${maxScore}`);
    job.info(`Average score: ${avgScore}`);
    job.info(`Overall score: ${totalScore}/${totalPoints} (${(totalScore / totalPoints) * 100}%)`);
  });

  return serverJob.jobSequenceId;
}

async function evaluateGeneratedQuestion({
  model,
  assistantMessageContents,
  userMessageContents,
  html,
  python,
}: {
  model: LanguageModel;
  userMessageContents: string;
  assistantMessageContents: string;
  html: string;
  python: string;
}): Promise<QuestionGenerationEvaluation | null> {
  const systemPrompt = formatPrompt([
    'Another LLM has generated a PrairieLearn question from the following prompt:',
    `<prompt>\n${userMessageContents.trim()}\n</prompt>`,
    [
      'Please evaluate it for correctness and clarity.',
      'If anything is incorrect or could be improved, please provide feedback.',
      'If the question looks fine, please indicate that as well.',
    ],
    [
      'Do not suggest ways the original prompt could have been improved.',
      'You should evaluate the question based on the prompt as it is written.',
    ],
    [
      'Remember that for pedagogical reasons, instructors may include extra information or distractors.',
      'They may also choose to make students carefully consider unit conversions without explicitly prompting for them.',
      'These are not considered errors unless they are factually incorrect or egregiously misleading; do not factor them into your evaluation.',
    ],
    // This should include relevant documentation for the elements used in the
    // generated question, as well as our baseline context about how PrairieLearn
    // works and some example questions. This is a lot of tokens, but it's
    // important for accurate evaluation since it'll tell the LLM about which
    // elements/attributes are available and how elements behave.
    'The assistant generated the following response:',
    `<response>\n${assistantMessageContents.trim()}\n</response>`,
    'The user will now provide the question HTML and Python files that the LLM generated for this prompt.',
  ]);

  const generatedQuestion: string[] = ['```html', html.trim(), '```'];
  if (python) {
    generatedQuestion.push('', '```python', python.trim(), '```');
  } else {
    generatedQuestion.push('', 'No Python file was generated.');
  }

  const response = await generateObject({
    model,
    system: systemPrompt,
    prompt: generatedQuestion.join('\n'),
    schema: QuestionGenerationEvaluationSchema,
    providerOptions: {
      openai: {
        strictJsonSchema: true,
        reasoningEffort: 'low',
      } satisfies OpenAIResponsesProviderOptions,
    },
  });

  return response.object;
}
