export enum FileType {
  Course = 'course',
  Question = 'question',
  CourseInstance = 'courseInstance',
  Assessment = 'assessment',
  File = 'file',
}

interface CourseInfo {
  type: FileType.Course;
}

export interface QuestionInfo {
  type: FileType.Question;
  qid: string;
}

export interface CourseInstanceInfo {
  type: FileType.CourseInstance;
  ciid: string;
}

export interface AssessmentInfo {
  type: FileType.Assessment;
  ciid: string;
  aid: string;
}

interface File {
  type: FileType.File;
}

export type FileDetails = CourseInfo | QuestionInfo | CourseInstanceInfo | AssessmentInfo | File;

export interface FileMetadata {
  syncErrors: string | null;
  syncWarnings: string | null;
  uuid: string | null;
  type: FileType;
}
