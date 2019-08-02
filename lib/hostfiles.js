const path = require('path');
const fs = require('fs-extra');

module.exports.copyQuestionPythonFiles = async function() {
  const pythonDir = path.join(__dirname, '..', 'python');
  const targetDir = '/hostfiles/python';
  await fs.emptyDir(targetDir);
  await fs.copy(pythonDir, targetDir);
};

module.exports.copyElementFiles = async function() {
  const elementsDir = path.join(__dirname, '..', 'elements');
  const targetDir = '/hostfiles/elements';
  await fs.emptyDir(targetDir);
  await fs.copy(elementsDir, targetDir);
};

module.exports.copyExampleCourseFiles = async function() {
  const exmapleCourseDir = path.join(__dirname, '..', 'exampleCourse');
  const targetDir = '/hostfiles/exampleCourse';
  await fs.emptyDir(targetDir);
  await fs.copy(exmapleCourseDir, targetDir);
};
