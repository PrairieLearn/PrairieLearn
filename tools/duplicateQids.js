#!/usr/bin/env node

const fs = require('fs-extra');
const path = require('path');

const rootDir = process.argv[2];
if (!rootDir) {
  console.error('Must specify a drectory of courses');
  process.exit(1);
}

function findDuplicateIds(thing, foundIds, duplicateIds) {
  if (Array.isArray(thing)) {
    thing.forEach(t => findDuplicateIds(t, foundIds, duplicateIds));
  } else {
    Object.entries(thing).forEach(([key, value]) => {
      if (typeof value === 'object') {
        findDuplicateIds(value, foundIds, duplicateIds);
        return;
      }
      if (key === 'id') {
        if (foundIds.has(value)) {
          duplicateIds.add(value);
        } else {
          foundIds.add(value);
        }
      }
    });
  }
}

(async () => {
  // Assume all directories below us are course reps
  const rootContents = await fs.readdir(rootDir);

  const coursesWithDuplicates = new Set();
  let assessmentsWithDuplicatesCount = 0;

  for (const entry of rootContents) {
    const courseDir = path.join(rootDir, entry);
    const courseInfoPath = path.join(courseDir, 'infoCourse.json');
    const courseInfoExists = await fs.exists(courseInfoPath);
    if (!courseInfoExists) {
      continue;
    }

    // Get a list of course instances
    const courseInstancesPath = path.join(courseDir, 'courseInstances');
    if (!(await fs.exists(courseInstancesPath))) {
      continue;
    }
    const courseInstances = await fs.readdir(courseInstancesPath);
    for (const courseInstance of courseInstances) {
      const courseInstancePath = path.join(courseInstancesPath, courseInstance);
      const courseInstanceAssessmentsPath = path.join(courseInstancePath, 'assessments');
      if (!(await fs.exists(courseInstanceAssessmentsPath))) {
        continue;
      }
      const courseInstanceAssessments = await fs.readdir(courseInstanceAssessmentsPath);
      for (const assessment of courseInstanceAssessments) {
        const assessmentInfoPath = path.join(courseInstanceAssessmentsPath, assessment, 'infoAssessment.json');
        if (!(await fs.exists(assessmentInfoPath))) {
          continue;
        }
        const assessmentInfo = await fs.readJSON(assessmentInfoPath);
        // Walk into zones looking for IDs
        const foundIds = new Set();
        const duplicateIds = new Set();
        findDuplicateIds(assessmentInfo.zones, foundIds, duplicateIds);
        if (duplicateIds.size > 0) {
          const duplicateQids = [...duplicateIds].join(', ');
          console.log(`${assessmentInfoPath} has duplicate QIDs: ${duplicateQids}`);
          assessmentsWithDuplicatesCount += 1;
          coursesWithDuplicates.add(entry);
        }
      }
    }
  }

  console.log('\n');
  console.log(`Assessments with duplicate QIDS: ${assessmentsWithDuplicatesCount}`);
  console.log(`Courses with duplicates (${coursesWithDuplicates.size}):`);
  [...coursesWithDuplicates].forEach(course => console.log(course));

})().catch(err => console.error(err));
