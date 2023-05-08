const { logger } = require('@prairielearn/logger');
const path = require('path');

module.exports.encodePath = function (originalPath) {
  try {
    let encodedPath = [];
    path
      .normalize(originalPath)
      .split(path.sep)
      .forEach((dir) => {
        encodedPath.push(encodeURIComponent(dir));
      });
    return encodedPath.join('/');
  } catch (err) {
    logger.error(`encodePath: returning empty string because failed to encode ${originalPath}`);
    return '';
  }
};

module.exports.decodePath = function (originalPath) {
  try {
    let decodedPath = [];
    originalPath.split(path.sep).forEach((dir) => {
      decodedPath.push(decodeURIComponent(dir));
    });
    return decodedPath.join('/');
  } catch (err) {
    logger.error(`decodePath: returning empty string because failed to decode ${originalPath}`);
    return '';
  }
};
