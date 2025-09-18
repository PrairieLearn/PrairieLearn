import { z } from 'zod';

import { DateFromISOString } from '@prairielearn/zod';

export { DateFromISOString }

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

// Assignment-Level access control cannot inherit as there is nothing to inherit from. Thus, *enabled fields cannot be NULL.
const createAssignmentLevelValidator = (enabledFields: string[]) => {
  return (data: any, ctx: any) => {
    const isAssignmentLevel = !data.targets || data.targets.length === 0;
    
    if (isAssignmentLevel) {
      const checkForNullEnabled = (obj: any, path: string[] = []) => {
        if (!obj || typeof obj !== 'object') return; // If we are not an object, stop.
        
        for (const [key, value] of Object.entries(obj)) {
          const currentPath = [...path, key];
          
          if (key.endsWith('Enabled') && value === null) {
            ctx.addIssue({
              code: 'custom',
              message: `Assignment-level permissions cannot have null *Enabled fields (found null ${key})`,
              path: currentPath,
            });
          } else if (typeof value === 'object' && value !== null) {
            checkForNullEnabled(value, currentPath);
          }
        }
      };
      
      checkForNullEnabled(data);
    }
  };
};

const DeadlineSchema = z.object({
  date: DateFromISOString,
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
  releaseDate: DateFromISOString.optional(),
  dueDateEnabled: z.boolean().nullable().optional(),
  dueDate: DateFromISOString.optional(),
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
  showAgainDate: DateFromISOString.optional(),
  hideAgainDateEnabled: z.boolean().nullable().optional(),
  hideAgainDate: DateFromISOString.optional(),
}).refine(
  createEnabledFieldValidator([
    ['showAgainDateEnabled', 'showAgainDate'],
    ['hideAgainDateEnabled', 'hideAgainDate'],
  ]),
  { message: "When a *DateEnabled field is null, the corresponding date cannot be populated" }
).optional();

const HideScoreDateControlSchema = z.object({
  showAgainDateEnabled: z.boolean().nullable().optional(),
  showAgainDate: DateFromISOString.optional(),
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
}).superRefine(createAssignmentLevelValidator([])).optional();

type AccessControl = z.infer<typeof AccessControlSchema>;

export { AccessControlSchema, type AccessControl };