import { z } from 'zod';

const createEnabledFieldValidator = (pairs: Array<[string, string]>) => {
  return (data: any) => {
    for (const [enabledField, valueField] of pairs) {
      if (data[enabledField] === null && data[valueField] !== undefined) {
        return false;
      }
    }
    return true;
  };
};

const DeadlineSchema = z.object({
  date: z.string(),
  credit: z.number(),
}).optional();

const AfterLastDeadlineSchema = z.object({
  allowSubmissions: z.boolean().optional(),
  creditEnabled: z.boolean().nullable().optional(),
  credit: z.number().optional(),
}).refine(
  createEnabledFieldValidator([['creditEnabled', 'credit']]),
  { message: "When creditEnabled is null, credit cannot be populated" }
).optional();

const DateControlSchema = z.object({
  enabled: z.boolean().nullable().optional(),
  releaseDateEnabled: z.boolean().nullable().optional(),
  releaseDate: z.string().optional(),
  dueDateEnabled: z.boolean().nullable().optional(),
  dueDate: z.string().optional(),
  earlyDeadlinesEnabled: z.boolean().nullable().optional(),
  earlyDeadlines: z.array(DeadlineSchema).optional(),
  lateDeadlinesEnabled: z.boolean().nullable().optional(),
  lateDeadlines: z.array(DeadlineSchema).optional(),
  afterLastDeadline: AfterLastDeadlineSchema,
  durationMinutesEnabled: z.boolean().nullable().optional(),
  durationMinutes: z.number().optional(),
  passwordEnabled: z.boolean().nullable().optional(),
  password: z.string().optional(),
}).refine(
  createEnabledFieldValidator([
    ['releaseDateEnabled', 'releaseDate'],
    ['dueDateEnabled', 'dueDate'],
    ['earlyDeadlinesEnabled', 'earlyDeadlines'],
    ['lateDeadlinesEnabled', 'lateDeadlines'],
    ['durationMinutesEnabled', 'durationMinutes'],
    ['passwordEnabled', 'password'],
  ]),
  { message: "When an *Enabled field is null, the corresponding field cannot be populated" }
).optional();

const ExamSchema = z.object({
  examUuid: z.string(),
  readOnly: z.boolean().optional(),
}).optional();

const PrairieTestControlSchema = z.object({
  enabled: z.boolean().optional(),
  exams: z.array(ExamSchema).optional(),
}).optional();

const HideQuestionsDateControlSchema = z.object({
  showAgainDateEnabled: z.boolean().nullable().optional(),
  showAgainDate: z.string().optional(),
  hideAgainDateEnabled: z.boolean().nullable().optional(),
  hideAgainDate: z.string().optional(),
}).refine(
  createEnabledFieldValidator([
    ['showAgainDateEnabled', 'showAgainDate'],
    ['hideAgainDateEnabled', 'hideAgainDate'],
  ]),
  { message: "When a *DateEnabled field is null, the corresponding date cannot be populated" }
).optional();

const HideScoreDateControlSchema = z.object({
  showAgainDateEnabled: z.boolean().nullable().optional(),
  showAgainDate: z.string().optional(),
}).refine(
  createEnabledFieldValidator([['showAgainDateEnabled', 'showAgainDate']]),
  { message: "When showAgainDateEnabled is null, showAgainDate cannot be populated" }
).optional();

const AfterCompleteSchema = z.object({
  hideQuestions: z.boolean().optional(),
  hideQuestionsDateControl: HideQuestionsDateControlSchema,
  hideScore: z.boolean().optional(),
  hideScoreDateControl: HideScoreDateControlSchema,
}).optional();

const AccessControlSchema = z.object({
  targets: z.array(z.string()).optional(),
  enabled: z.boolean().optional(), // default true if not set
  blockAccess: z.boolean().optional(), // default false if not set
  
  listBeforeRelease: z.boolean().optional(),
  dateControl: DateControlSchema,
  prairieTestControl: PrairieTestControlSchema,
  afterComplete: AfterCompleteSchema,
}).optional();

type AccessControl = z.infer<typeof AccessControlSchema>;

export { AccessControlSchema, type AccessControl };