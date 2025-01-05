import * as fs from 'node:fs';
import * as path from 'node:path';

import _ from 'lodash';
import { zodToJsonSchema } from 'zod-to-json-schema';

import {
  /* no support for deprecated options */
  AdminQuerySchema,
  AssessmentSchema,
  CourseSchema,
  CourseInstanceSchema,
  ElementCoreSchema,
  ElementCourseSchema,
  ElementExtensionSchema,
  NewsItemSchema,
  QuestionSchema,
  CalculationQuestionOptionsSchema,
  CheckboxQuestionOptionsSchema,
  FileQuestionOptionsSchema,
  MultipleChoiceQuestionOptionsSchema,
  MultipleTrueFalseQuestionOptionsSchema,
  QuestionOptionsv3Schema,
  /* supports deprecated options */
  LegacyAssessmentSchema,
  LegacyCourseInstanceSchema,
  LegacyElementCoreSchema,
  LegacyElementCourseSchema,
  LegacyElementExtensionSchema,
  LegacyQuestionSchema,
} from './schemas/index.js';
/**
 * Reads a JSON file from the schemas directory.
 */
function readSchema(filePath: string) {
  return JSON.parse(
    fs.readFileSync(path.resolve(import.meta.dirname, 'schemas', filePath), 'utf8'),
  );
}

export const infoNewsItem = zodToJsonSchema(NewsItemSchema, {
  name: 'News Item Info',
  nameStrategy: 'title',
  target: 'jsonSchema2019-09',
});
export const infoAssessment = zodToJsonSchema(LegacyAssessmentSchema, {
  name: 'Assessment info',
  nameStrategy: 'title',
  target: 'jsonSchema2019-09',
});
export const infoCourse = zodToJsonSchema(CourseSchema, {
  name: 'Course information',
  nameStrategy: 'title',
  target: 'jsonSchema2019-09',
});
export const infoCourseInstance = zodToJsonSchema(LegacyCourseInstanceSchema, {
  name: 'Course instance information',
  nameStrategy: 'title',
  target: 'jsonSchema2019-09',
});
export const infoElementCore = zodToJsonSchema(LegacyElementCoreSchema, {
  name: 'Element Info',
  nameStrategy: 'title',
  target: 'jsonSchema2019-09',
});
export const infoElementCourse = zodToJsonSchema(LegacyElementCourseSchema, {
  name: 'Element Info',
  nameStrategy: 'title',
  target: 'jsonSchema2019-09',
});
export const infoElementExtension = zodToJsonSchema(LegacyElementExtensionSchema, {
  name: 'Element Extension Info',
  nameStrategy: 'title',
  target: 'jsonSchema2019-09',
});
export const infoQuestion = zodToJsonSchema(LegacyQuestionSchema, {
  name: 'Question Info',
  nameStrategy: 'title',
  target: 'jsonSchema2019-09',
});
export const questionOptionsCalculation = zodToJsonSchema(CalculationQuestionOptionsSchema, {
  name: 'Calculation question options',
  nameStrategy: 'title',
  target: 'jsonSchema2019-09',
});
export const questionOptionsCheckbox = zodToJsonSchema(CheckboxQuestionOptionsSchema, {
  name: 'MultipleChoice question options',
  nameStrategy: 'title',
  target: 'jsonSchema2019-09',
});
export const questionOptionsFile = zodToJsonSchema(FileQuestionOptionsSchema, {
  name: 'File question options',
  nameStrategy: 'title',
  target: 'jsonSchema2019-09',
});
export const questionOptionsMultipleChoice = zodToJsonSchema(MultipleChoiceQuestionOptionsSchema, {
  name: 'MultipleChoice question options',
  nameStrategy: 'title',
  target: 'jsonSchema2019-09',
});
export const questionOptionsMultipleTrueFalse = zodToJsonSchema(
  MultipleTrueFalseQuestionOptionsSchema,
  {
    name: 'MultipleTrueFalse question options',
    nameStrategy: 'title',
    target: 'jsonSchema2019-09',
  },
);
export const questionOptionsv3 = zodToJsonSchema(QuestionOptionsv3Schema, {
  name: 'v3 question options',
  nameStrategy: 'title',
  target: 'jsonSchema2019-09',
});

/* Diff the two */
/**
 * Deep diff between two object-likes
 * @param  fromObject the original object
 * @param  toObject   the updated object
 * @return            a new object which represents the diff
 */
function deepDiff(fromObject: any, toObject: any) {
  const changes = {};

  const buildPath = (path, obj, key) => (_.isUndefined(path) ? key : `${path}.${key}`);

  const walk = (fromObject, toObject, path) => {
    for (const key of _.keys(fromObject)) {
      const currentPath = buildPath(path, fromObject, key);
      if (!_.has(toObject, key)) {
        changes[currentPath] = { from: _.get(fromObject, key) };
      }
    }

    for (const [key, to] of _.entries(toObject)) {
      const currentPath = buildPath(path, toObject, key);
      if (!_.has(fromObject, key)) {
        changes[currentPath] = { to };
      } else {
        const from = _.get(fromObject, key);
        if (!_.isEqual(from, to)) {
          if (_.isObjectLike(to) && _.isObjectLike(from)) {
            walk(from, to, currentPath);
          } else {
            changes[currentPath] = { from, to };
          }
        }
      }
    }
  };

  walk(fromObject, toObject, undefined);

  return changes;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const doTest = () => {
  // properties and additionalProperties are always set
  // deprecated is not supported in Zod
  // more explicit: e.g. enums still get a type: string. additionalProperties: true/false set.
  // console.log(deepDiff(infoNewsItem, readSchema('infoNewsItem.json')));
  // console.log(deepDiff(infoAssessment, readSchema('infoAssessment.json')));
  // console.log(deepDiff(infoCourse, readSchema('infoCourse.json')));
  // console.log(deepDiff(infoCourseInstance, readSchema('infoCourseInstance.json')));
  // console.log(deepDiff(infoElementCore, readSchema('infoElementCore.json')));
  // console.log(deepDiff(infoElementCourse, readSchema('infoElementCourse.json')));
  // console.log(deepDiff(infoElementExtension, readSchema('infoElementExtension.json')));
  console.dir(infoQuestion, { depth: null });
  console.log(deepDiff(infoQuestion, readSchema('infoQuestion.json')));
  // console.log(deepDiff(questionOptionsCalculation, readSchema('questionOptionsCalculation.json')));
  // console.log(deepDiff(questionOptionsCheckbox, readSchema('questionOptionsCheckbox.json')));
  // console.log(deepDiff(questionOptionsFile, readSchema('questionOptionsFile.json')));
  // console.log(
  //   deepDiff(questionOptionsMultipleChoice, readSchema('questionOptionsMultipleChoice.json')),
  // );
  // console.log(
  //   deepDiff(questionOptionsMultipleTrueFalse, readSchema('questionOptionsMultipleTrueFalse.json')),
  // );
  // console.log(deepDiff(questionOptionsv3, readSchema('questionOptionsv3.json')));
};

// doTest();
