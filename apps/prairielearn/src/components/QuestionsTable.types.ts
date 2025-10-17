export interface QuestionsTableData {
  course_instance_ids: string[];
  showAddQuestionButton: boolean;
  showAiGenerateQuestionButton: boolean;
  qidPrefix: string | undefined;
  urlPrefix: string;
  plainUrlPrefix: string;
}
