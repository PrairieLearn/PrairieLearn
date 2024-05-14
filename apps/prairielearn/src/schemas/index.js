// @ts-check
import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * Reads a JSON file from the schemas directory.
 * @param {string} filePath
 */
function readSchema(filePath) {
  return JSON.parse(
    fs.readFileSync(path.resolve(import.meta.dirname, 'schemas', filePath), 'utf8'),
  );
}

export const infoNewsItem = readSchema('./infoNewsItem.json');
export const infoAssessment = readSchema('./infoAssessment.json');
export const infoCourse = readSchema('./infoCourse.json');
export const infoCourseInstance = readSchema('./infoCourseInstance.json');
export const infoElementCore = readSchema('./infoElementCore.json');
export const infoElementCourse = readSchema('./infoElementCourse.json');
export const infoElementExtension = readSchema('./infoElementExtension.json');
export const infoQuestion = readSchema('./infoQuestion.json');
export const questionOptionsCalculation = readSchema('./questionOptionsCalculation.json');
export const questionOptionsCheckbox = readSchema('./questionOptionsCheckbox.json');
export const questionOptionsFile = readSchema('./questionOptionsFile.json');
export const questionOptionsMultipleChoice = readSchema('./questionOptionsMultipleChoice.json');
export const questionOptionsMultipleTrueFalse = readSchema(
  './questionOptionsMultipleTrueFalse.json',
);
export const questionOptionsv3 = readSchema('./questionOptionsv3.json');
