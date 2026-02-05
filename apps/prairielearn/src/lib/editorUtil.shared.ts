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

export function getUniqueNames({
  shortNames,
  longNames,
  shortName = 'New',
  longName = 'New',
}: {
  shortNames: string[];
  longNames: string[];
  /**
   * Defaults to 'New' because this function previously only handled the case where the shortName was 'New'
   * Long name is matched case-sensitively
   */
  shortName?: string;
  /**
   * Defaults to 'New' because this function previously only handled the case where the longName was 'New'
   * Short name is always matched case-insensitively, as it is generally used to construct file paths
   */
  longName?: string;
}): { shortName: string; longName: string } {
  function getNumberShortName(oldShortNames: string[]): number {
    let numberOfMostRecentCopy = 1;

    const shortNameCompare = shortName.toLowerCase();

    oldShortNames.forEach((oldShortName) => {
      // shortName is a copy of oldShortName if:
      // it matches (case-sensitively), or
      // if oldShortName matches {shortName}_{number from 0-9}

      const oldShortNameCompare = oldShortName.toLowerCase();
      const found =
        shortNameCompare === oldShortNameCompare ||
        oldShortNameCompare.match(new RegExp(`^${escapeRegExp(shortNameCompare)}_([0-9]+)$`));
      if (found) {
        const foundNumber = found === true ? 1 : Number.parseInt(found[1]);
        if (foundNumber >= numberOfMostRecentCopy) {
          numberOfMostRecentCopy = foundNumber + 1;
        }
      }
    });
    return numberOfMostRecentCopy;
  }

  function getNumberLongName(oldLongNames: string[]): number {
    let numberOfMostRecentCopy = 1;
    // longName is a copy of oldLongName if:
    // it matches exactly, or
    // if oldLongName matches {longName} ({number from 0-9})

    oldLongNames.forEach((oldLongName) => {
      if (typeof oldLongName !== 'string') return;
      const found =
        oldLongName === longName ||
        oldLongName.match(new RegExp(`^${escapeRegExp(longName)} \\(([0-9]+)\\)$`));
      if (found) {
        const foundNumber = found === true ? 1 : Number.parseInt(found[1]);
        if (foundNumber >= numberOfMostRecentCopy) {
          numberOfMostRecentCopy = foundNumber + 1;
        }
      }
    });
    return numberOfMostRecentCopy;
  }

  const numberShortName = getNumberShortName(shortNames);
  const numberLongName = getNumberLongName(longNames);
  const number = Math.max(numberShortName, numberLongName);

  if (number === 1 && shortName !== 'New' && longName !== 'New') {
    // If there are no existing copies, and the shortName/longName aren't the default ones, no number is needed at the end of the names
    return {
      shortName,
      longName,
    };
  } else {
    // If there are existing copies, a number is needed at the end of the names
    return {
      shortName: `${shortName}_${number}`,
      longName: `${longName} (${number})`,
    };
  }
}

/**
 * Returns the new value if it differs from the default value. Otherwise, returns undefined.
 * This is helpful for setting JSON properties that we only want to write to if they are different
 * than the default value.
 *
 * `defaultValue` may be either a value to compare directly with `===`, or a function
 * that accepts a value and returns a boolean to indicate if it should be considered
 * a default value.
 *
 */
export function propertyValueWithDefault(existingValue: any, newValue: any, defaultValue: any) {
  const isExistingDefault =
    typeof defaultValue === 'function'
      ? defaultValue(existingValue)
      : existingValue === defaultValue;
  const isNewDefault =
    typeof defaultValue === 'function' ? defaultValue(newValue) : newValue === defaultValue;

  if (existingValue === undefined) {
    if (!isNewDefault) {
      return newValue;
    }
    return undefined;
  } else {
    if (!isExistingDefault && isNewDefault) {
      return undefined;
    } else {
      return newValue;
    }
  }
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
