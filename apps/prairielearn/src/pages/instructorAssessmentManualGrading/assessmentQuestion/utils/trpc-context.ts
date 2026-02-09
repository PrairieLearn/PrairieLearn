import { createPageTRPC } from '../../../../lib/client/trpc.js';
import type { ManualGradingAssessmentQuestionRouter } from '../trpc.js';

export const { TRPCProvider, useTRPC } = createPageTRPC<ManualGradingAssessmentQuestionRouter>();
