const ERR = require('async-stacktrace');
const AWS = require('aws-sdk');
const Docker = require('dockerode');
const _ = require('lodash');
const moment = require('moment');
const debug = require('debug')('prairielearn:dockerUtil');
const util = require('util');

const config = require('./config');
const { logger } = require('@prairielearn/logger');

var dockerUtil = {};
var docker = new Docker();

var dockerAuthData = null;

function AuthDataExtractLogin(data) {
  let buff = Buffer.from(data.authorizationToken, 'base64');
  let authString = buff.toString('ascii');
  let authArray = authString.split(':');

  var auth = {
    username: authArray[0],
    password: authArray[1],
  };
  debug(auth);
  return auth;
}

dockerUtil.setupDockerAuth = function (callback) {
  if (!config.cacheImageRegistry) {
    return callback(null, {});
  }

  // If we have cached data that's not within an hour of expiring, use it
  if (dockerAuthData && moment().isBefore(moment(dockerAuthData.expiresAt).subtract(1, 'hour'))) {
    debug(dockerAuthData);
    logger.info('Using cached ECR authorization token');
    return callback(null, AuthDataExtractLogin(dockerAuthData));
  } else {
    logger.info('Getting ECR authorization token');
    const ecr = new AWS.ECR();
    ecr.getAuthorizationToken({}, (err, data) => {
      if (ERR(err, callback)) return;
      dockerAuthData = data.authorizationData[0];
      debug('dockerAuthData', dockerAuthData);
      return callback(null, AuthDataExtractLogin(dockerAuthData));
    });
  }
};

dockerUtil.setupDockerAuthAsync = util.promisify(dockerUtil.setupDockerAuth);

dockerUtil.DockerName = class DockerName {
  /*********************************************************************
   * Borrowed from https://github.com/apocas/dockerode/blob/master/lib/util.js
   * but turned into a class to manipulate which part of the docker image name
   * we need
   *********************************************************************/

  constructor(name) {
    this.original = name;
    this.registry = undefined;
    this.repository = name;
    this.tag = undefined;

    // Parse name into the object parts
    var separatorPos;
    var digestPos = name.indexOf('@');
    var colonPos = name.lastIndexOf(':');

    // @ symbol is more important
    if (digestPos >= 0) {
      separatorPos = digestPos;
    } else if (colonPos >= 0) {
      separatorPos = colonPos;
    }

    if (separatorPos) {
      // last colon is either the tag (or part of a port designation)
      var tag = name.slice(separatorPos + 1);

      // if it contains a / its not a tag and is part of the url
      if (tag.indexOf('/') === -1) {
        this.repository = name.slice(0, separatorPos);
        this.tag = tag;
      }
    }

    var slashes = this.repository.split('/');
    if (slashes.length > 2) {
      this.registry = slashes.slice(0, -2).join('/');
      this.repository = slashes.slice(-2).join('/');
    }
  }

  getRepository() {
    return this.repository;
  }
  getTag() {
    return this.tag;
  }
  getRegistryRepo() {
    var combined = '';

    if (typeof this.registry !== 'undefined') {
      combined = this.registry + '/';
    }
    combined += this.repository;
    return combined;
  }
  getCombined(latestTag = false) {
    var combined = '';

    if (typeof this.registry !== 'undefined') {
      combined = this.registry + '/';
    }
    combined += this.repository;
    if (this.tag) {
      combined += ':' + this.tag;
    } else if (latestTag) {
      combined += ':latest';
    }
    return combined;
  }
};

function locateImage(image, callback) {
  debug('locateImage');
  docker.listImages(function (err, list) {
    if (ERR(err, callback)) return;
    debug(`locateImage: list=${list}`);
    for (var i = 0, len = list.length; i < len; i++) {
      if (list[i].RepoTags && list[i].RepoTags.indexOf(image) !== -1) {
        return callback(null, docker.getImage(list[i].Id));
      }
    }
    return callback(new Error(`Unable to find image=${image}`));
  });
}

function confirmOrCreateECRRepo(repo, job, callback) {
  const ecr = new AWS.ECR();
  job.info(`Describing repositories with name: ${repo}`);
  ecr.describeRepositories({ repositoryNames: [repo] }, (err, data) => {
    let repositoryFound = false;
    if (err) {
      job.info(`Error returned from describeRepositories(): ${err}`);
      job.info('Treating this error as meaning the desired repository does not exist');
    } else {
      repositoryFound = _.find(data.repositories, ['repositoryName', repo]);
    }

    if (!repositoryFound) {
      job.info('Repository not found');

      job.info(`Creating repository: ${repo}`);
      var params = {
        repositoryName: repo,
      };
      ecr.createRepository(params, (err) => {
        if (ERR(err, callback)) return;
        job.info('Successfully created repository');
        callback(null);
      });
    } else {
      job.info('Repository found');
      // Already exists, nothing to do
      callback(null);
    }
  });
}

dockerUtil.logProgressOutput = function (output, job, printedInfos, prefix) {
  let info = null;
  if (
    'status' in output &&
    'id' in output &&
    'progressDetail' in output &&
    output.progressDetail.total
  ) {
    info = `${output.status} ${output.id} (${output.progressDetail.total} bytes)`;
  } else if ('status' in output && 'id' in output) {
    info = `${output.status} ${output.id}`;
  } else if ('status' in output) {
    info = `${output.status}`;
  }
  if (info != null && !printedInfos.has(info)) {
    printedInfos.add(info);
    job.info(prefix + info);
  }
};

dockerUtil.pullAndPushToECR = function (image, dockerAuth, job, callback) {
  debug(`pullAndPushtoECR for ${image}`);

  if (!config.cacheImageRegistry) {
    return callback(new Error('cacheImageRegistry not defined'));
  }

  const repository = new dockerUtil.DockerName(image);
  const params = {
    fromImage: repository.getRepository(),
    tag: repository.getTag() || 'latest',
  };
  job.info(`Pulling ${repository.getCombined()}`);
  docker.createImage({}, params, (err, stream) => {
    if (ERR(err, callback)) return;

    const printedInfos = new Set();
    docker.modem.followProgress(
      stream,
      (err) => {
        if (ERR(err, callback)) return;

        job.info('Pull complete');

        // Find the image we just downloaded
        const downloadedImage = repository.getCombined(true);
        job.info(`Locating downloaded image: ${downloadedImage}`);
        locateImage(downloadedImage, (err, localImage) => {
          if (ERR(err, callback)) return;
          job.info('Successfully located downloaded image');

          // Tag the image to add the new registry
          repository.registry = config.cacheImageRegistry;

          var options = {
            repo: repository.getCombined(),
          };
          job.info(`Tagging image: ${options.repo}`);
          localImage.tag(options, (err) => {
            if (ERR(err, callback)) return;
            job.info('Successfully tagged image');

            const repositoryName = repository.getRepository();
            job.info(`Ensuring repository exists: ${repositoryName}`);
            confirmOrCreateECRRepo(repositoryName, job, (err) => {
              if (ERR(err, callback)) return;
              job.info('Successfully ensured repository exists');

              // Create a new docker image instance with the new registry name
              // localImage isn't specific enough to the ECR repo
              const pushImageName = repository.getCombined();
              var pushImage = new Docker.Image(docker.modem, pushImageName);

              job.info(`Pushing image: ${repository.getCombined()}`);
              pushImage.push(
                {},
                (err, stream) => {
                  if (ERR(err, callback)) return;

                  const printedInfos = new Set();
                  docker.modem.followProgress(
                    stream,
                    (err) => {
                      if (ERR(err, callback)) return;
                      job.info('Push complete');
                      callback(null);
                    },
                    (output) => {
                      dockerUtil.logProgressOutput(output, job, printedInfos, 'Push progress: ');
                    }
                  );
                },
                dockerAuth
              );
            });
          });
        });
      },
      (output) => {
        dockerUtil.logProgressOutput(output, job, printedInfos, 'Pull progress: ');
      }
    );
  });
};

module.exports = dockerUtil;
