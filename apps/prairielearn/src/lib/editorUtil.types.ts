import { assertNever } from './types.js';

export enum FileType {
  Course = 'course',
  Question = 'question',
  CourseInstance = 'courseInstance',
  Assessment = 'assessment',
  File = 'file',
}

export function friendlyNameForFileType(type: FileType) {
  switch (type) {
    case FileType.Course:
      return 'Course';
    case FileType.Question:
      return 'Question';
    case FileType.CourseInstance:
      return 'Course Instance';
    case FileType.Assessment:
      return 'Assessment';
    case FileType.File:
      return 'File';
    default:
      assertNever(type);
  }
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
