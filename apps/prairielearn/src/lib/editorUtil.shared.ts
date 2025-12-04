import debugfn from 'debug';

import { escapeRegExp } from '@prairielearn/sanitize';

const debug = debugfn('prairielearn:editors');

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

export function getNamesForCopy(
  oldShortName: string,
  shortNames: string[],
  oldLongName: string | null,
  longNames: string[],
): { shortName: string; longName: string } {
  function getBaseShortName(oldname: string): string {
    const found = oldname.match(/^(.*)_copy[0-9]+$/);
    if (found) {
      return found[1];
    } else {
      return oldname;
    }
  }

  function getBaseLongName(oldname: string | null): string {
    if (typeof oldname !== 'string') return 'Unknown';
    debug(oldname);
    const found = oldname.match(/^(.*) \(copy [0-9]+\)$/);
    debug(found);
    if (found) {
      return found[1];
    } else {
      return oldname;
    }
  }

  function getNumberShortName(basename: string, oldnames: string[]): number {
    let number = 1;
    oldnames.forEach((oldname) => {
      const found = oldname.match(new RegExp(`^${escapeRegExp(basename)}_copy([0-9]+)$`));
      if (found) {
        const foundNumber = Number.parseInt(found[1]);
        if (foundNumber >= number) {
          number = foundNumber + 1;
        }
      }
    });
    return number;
  }

  function getNumberLongName(basename: string, oldnames: string[]): number {
    let number = 1;
    oldnames.forEach((oldname) => {
      if (typeof oldname !== 'string') return;
      const found = oldname.match(new RegExp(`^${escapeRegExp(basename)} \\(copy ([0-9]+)\\)$`));
      if (found) {
        const foundNumber = Number.parseInt(found[1]);
        if (foundNumber >= number) {
          number = foundNumber + 1;
        }
      }
    });
    return number;
  }

  const baseShortName = getBaseShortName(oldShortName);
  const baseLongName = getBaseLongName(oldLongName);
  const numberShortName = getNumberShortName(baseShortName, shortNames);
  const numberLongName = getNumberLongName(baseLongName, longNames);
  const number = Math.max(numberShortName, numberLongName);
  return {
    shortName: `${baseShortName}_copy${number}`,
    longName: `${baseLongName} (copy ${number})`,
  };
}
