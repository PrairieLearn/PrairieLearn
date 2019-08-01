const path = require('path');
const fs = require('fs-extra');

module.exports.copyQuestionPythonFiles = async function() {
  const pythonDir = path.join(__dirname, '..', 'python');
  const targetDir = '/hostfiles/python';
  await fs.copy(pythonDir, targetDir);
};

module.exports.copyElementFiles = async function() {
  const elementsDir = path.join(__dirname, '..', 'elements');
  const targetDir = '/hostfiles/elements';
  await fs.copy(elementsDir, targetDir);
};
