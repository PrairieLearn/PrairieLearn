export type MaybePromise<T> = T | Promise<T>;

export const QUESTION_RENDERING_STAGES = ['question-type', 'render', 'transform'] as const;
export type QuestionRenderingStage = (typeof QUESTION_RENDERING_STAGES)[number];

export interface QuestionRenderingErrorContext<
  Assessment,
  AssessmentInstance,
  Question,
  QuestionType,
> {
  assessment: Assessment;
  assessmentInstance: AssessmentInstance;
  question: Question;
  index: number;
  stage: QuestionRenderingStage;
  questionType: QuestionType | undefined;
  html: string | undefined;
}

export type QuestionRenderingErrorClassifier<
  Assessment,
  AssessmentInstance,
  Question,
  QuestionType,
  QuestionFailure,
> = (
  error: unknown,
  context: QuestionRenderingErrorContext<Assessment, AssessmentInstance, Question, QuestionType>,
) => MaybePromise<QuestionFailure | undefined>;

export interface AssessmentInstancePrintingAdapter<
  Assessment,
  AssessmentInstance,
  Question,
  QuestionType,
  QuestionFailure = never,
> {
  getQuestions: (
    assessmentInstance: AssessmentInstance,
    assessment: Assessment,
  ) => MaybePromise<readonly Question[]>;
  getQuestionType: (
    question: Question,
    assessmentInstance: AssessmentInstance,
    assessment: Assessment,
  ) => MaybePromise<QuestionType>;
  renderQuestion: (
    question: Question,
    assessmentInstance: AssessmentInstance,
    assessment: Assessment,
  ) => MaybePromise<string>;
  classifyQuestionError?: QuestionRenderingErrorClassifier<
    Assessment,
    AssessmentInstance,
    Question,
    QuestionType,
    QuestionFailure
  >;
}

export interface PrintingAdapter<
  Assessment,
  AssessmentInstance,
  Question,
  QuestionType,
  QuestionFailure = never,
> extends AssessmentInstancePrintingAdapter<
  Assessment,
  AssessmentInstance,
  Question,
  QuestionType,
  QuestionFailure
> {
  createFreshAssessmentInstance: (assessment: Assessment) => MaybePromise<AssessmentInstance>;
}

export interface QuestionTransformerContext<
  Assessment,
  AssessmentInstance,
  Question,
  QuestionType,
> {
  assessment: Assessment;
  assessmentInstance: AssessmentInstance;
  question: Question;
  questionType: QuestionType;
  index: number;
  html: string;
}

export type QuestionTransformer<Assessment, AssessmentInstance, Question, QuestionType> = (
  context: QuestionTransformerContext<Assessment, AssessmentInstance, Question, QuestionType>,
) => MaybePromise<string>;

export interface RenderAssessmentQuestionsOptions<
  Assessment,
  AssessmentInstance,
  Question,
  QuestionType,
  QuestionFailure = never,
> {
  assessment: Assessment;
  adapter: PrintingAdapter<Assessment, AssessmentInstance, Question, QuestionType, QuestionFailure>;
  questionTransformers?: ReadonlyMap<
    NoInfer<QuestionType>,
    QuestionTransformer<
      NoInfer<Assessment>,
      NoInfer<AssessmentInstance>,
      NoInfer<Question>,
      NoInfer<QuestionType>
    >
  >;
  defaultQuestionTransformer?: QuestionTransformer<
    NoInfer<Assessment>,
    NoInfer<AssessmentInstance>,
    NoInfer<Question>,
    NoInfer<QuestionType>
  >;
}

export interface RenderAssessmentInstanceQuestionsOptions<
  Assessment,
  AssessmentInstance,
  Question,
  QuestionType,
  QuestionFailure = never,
> extends Omit<
  RenderAssessmentQuestionsOptions<
    Assessment,
    AssessmentInstance,
    Question,
    QuestionType,
    QuestionFailure
  >,
  'adapter'
> {
  assessmentInstance: AssessmentInstance;
  adapter: AssessmentInstancePrintingAdapter<
    Assessment,
    AssessmentInstance,
    Question,
    QuestionType,
    QuestionFailure
  >;
}

export interface RenderedQuestionResult<Question, QuestionType> {
  status: 'rendered';
  question: Question;
  questionType: QuestionType;
  index: number;
  html: string;
}

export interface FailedQuestionResult<Question, QuestionType, QuestionFailure> {
  status: 'failed';
  question: Question;
  questionType: QuestionType | undefined;
  index: number;
  stage: QuestionRenderingStage;
  failure: QuestionFailure;
}

export type QuestionRenderingResult<Question, QuestionType, QuestionFailure> =
  | RenderedQuestionResult<Question, QuestionType>
  | FailedQuestionResult<Question, QuestionType, QuestionFailure>;

export interface AssessmentQuestionsRenderingReport<
  AssessmentInstance,
  Question,
  QuestionType,
  QuestionFailure,
> {
  assessmentInstance: AssessmentInstance;
  questionResults: QuestionRenderingResult<Question, QuestionType, QuestionFailure>[];
}

export async function renderAssessmentQuestions<
  Assessment,
  AssessmentInstance,
  Question,
  QuestionType,
  QuestionFailure = never,
>({
  assessment,
  adapter,
  questionTransformers,
  defaultQuestionTransformer,
}: RenderAssessmentQuestionsOptions<
  Assessment,
  AssessmentInstance,
  Question,
  QuestionType,
  QuestionFailure
>): Promise<string[]> {
  const assessmentInstance = await adapter.createFreshAssessmentInstance(assessment);
  return await renderAssessmentInstanceQuestions({
    assessment,
    assessmentInstance,
    adapter,
    questionTransformers,
    defaultQuestionTransformer,
  });
}

export async function renderAssessmentInstanceQuestions<
  Assessment,
  AssessmentInstance,
  Question,
  QuestionType,
  QuestionFailure = never,
>({
  assessment,
  assessmentInstance,
  adapter,
  questionTransformers,
  defaultQuestionTransformer,
}: RenderAssessmentInstanceQuestionsOptions<
  Assessment,
  AssessmentInstance,
  Question,
  QuestionType,
  QuestionFailure
>): Promise<string[]> {
  const questions = await adapter.getQuestions(assessmentInstance, assessment);
  const renderedQuestions: string[] = [];

  for (const [index, question] of questions.entries()) {
    const questionType = await adapter.getQuestionType(question, assessmentInstance, assessment);
    const html = await adapter.renderQuestion(question, assessmentInstance, assessment);
    const transformer = questionTransformers?.get(questionType) ?? defaultQuestionTransformer;

    renderedQuestions.push(
      transformer
        ? await transformer({
            assessment,
            assessmentInstance,
            question,
            questionType,
            index,
            html,
          })
        : html,
    );
  }

  return renderedQuestions;
}

export async function renderAssessmentQuestionsReport<
  Assessment,
  AssessmentInstance,
  Question,
  QuestionType,
  QuestionFailure = never,
>({
  assessment,
  adapter,
  questionTransformers,
  defaultQuestionTransformer,
}: RenderAssessmentQuestionsOptions<
  Assessment,
  AssessmentInstance,
  Question,
  QuestionType,
  QuestionFailure
>): Promise<
  AssessmentQuestionsRenderingReport<AssessmentInstance, Question, QuestionType, QuestionFailure>
> {
  const assessmentInstance = await adapter.createFreshAssessmentInstance(assessment);
  return await renderAssessmentInstanceQuestionsReport({
    assessment,
    assessmentInstance,
    adapter,
    questionTransformers,
    defaultQuestionTransformer,
  });
}

export async function renderAssessmentInstanceQuestionsReport<
  Assessment,
  AssessmentInstance,
  Question,
  QuestionType,
  QuestionFailure = never,
>({
  assessment,
  assessmentInstance,
  adapter,
  questionTransformers,
  defaultQuestionTransformer,
}: RenderAssessmentInstanceQuestionsOptions<
  Assessment,
  AssessmentInstance,
  Question,
  QuestionType,
  QuestionFailure
>): Promise<
  AssessmentQuestionsRenderingReport<AssessmentInstance, Question, QuestionType, QuestionFailure>
> {
  const questions = await adapter.getQuestions(assessmentInstance, assessment);
  const questionResults: QuestionRenderingResult<Question, QuestionType, QuestionFailure>[] = [];

  for (const [index, question] of questions.entries()) {
    let questionType: QuestionType;
    try {
      questionType = await adapter.getQuestionType(question, assessmentInstance, assessment);
    } catch (error) {
      questionResults.push(
        await classifyQuestionError({
          error,
          adapter,
          assessment,
          assessmentInstance,
          question,
          index,
          stage: 'question-type',
          questionType: undefined,
          html: undefined,
        }),
      );
      continue;
    }

    let html: string;
    try {
      html = await adapter.renderQuestion(question, assessmentInstance, assessment);
    } catch (error) {
      questionResults.push(
        await classifyQuestionError({
          error,
          adapter,
          assessment,
          assessmentInstance,
          question,
          index,
          stage: 'render',
          questionType,
          html: undefined,
        }),
      );
      continue;
    }

    try {
      const transformer = questionTransformers?.get(questionType) ?? defaultQuestionTransformer;
      const transformedHtml = transformer
        ? await transformer({
            assessment,
            assessmentInstance,
            question,
            questionType,
            index,
            html,
          })
        : html;

      questionResults.push({
        status: 'rendered',
        question,
        questionType,
        index,
        html: transformedHtml,
      });
    } catch (error) {
      questionResults.push(
        await classifyQuestionError({
          error,
          adapter,
          assessment,
          assessmentInstance,
          question,
          index,
          stage: 'transform',
          questionType,
          html,
        }),
      );
    }
  }

  return { assessmentInstance, questionResults };
}

async function classifyQuestionError<
  Assessment,
  AssessmentInstance,
  Question,
  QuestionType,
  QuestionFailure,
>({
  error,
  adapter,
  assessment,
  assessmentInstance,
  question,
  index,
  stage,
  questionType,
  html,
}: {
  error: unknown;
  adapter: AssessmentInstancePrintingAdapter<
    Assessment,
    AssessmentInstance,
    Question,
    QuestionType,
    QuestionFailure
  >;
  assessment: Assessment;
  assessmentInstance: AssessmentInstance;
  question: Question;
  index: number;
  stage: QuestionRenderingStage;
  questionType: QuestionType | undefined;
  html: string | undefined;
}): Promise<FailedQuestionResult<Question, QuestionType, QuestionFailure>> {
  if (!adapter.classifyQuestionError) throw error;

  const failure = await adapter.classifyQuestionError(error, {
    assessment,
    assessmentInstance,
    question,
    index,
    stage,
    questionType,
    html,
  });
  if (failure === undefined) throw error;

  return {
    status: 'failed',
    question,
    questionType,
    index,
    stage,
    failure,
  };
}
