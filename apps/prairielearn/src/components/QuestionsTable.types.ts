import { type QuestionsPageDataAnsified } from '../models/questions.js';

export interface EncodedQuestionsData {
  plainUrlPrefix: string;
  urlPrefix: string;
  questions: QuestionsPageDataAnsified[];
  course_instances: {
    id: string;
    short_name: string | null;
    current: boolean;
  }[];
  showSharingSets: boolean;
  qidPrefix: string | undefined;
}
