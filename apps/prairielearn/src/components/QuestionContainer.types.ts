export type QuestionContext =
  | 'student_exam'
  | 'student_homework'
  | 'instructor'
  | 'public'
  | 'manual_grading';

export type QuestionRenderContext = 'manual_grading' | 'ai_grading';
