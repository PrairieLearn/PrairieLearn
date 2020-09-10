const ERR = require('async-stacktrace');
const AWS = require('aws-sdk');
const Docker = require('dockerode');
const _ = require('lodash');
const moment = require('moment');
const debug = require('debug')('prairielearn:dockerUtil');

const config = require('./config');
const logger = require('./logger');

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

dockerUtil.setupDockerAuth = function(callback) {

    // If we have cached data that's not within an hour of expiring, use it
    if (dockerAuthData && moment().isBefore(moment(dockerAuthData.expiresAt).subtract(1, 'hour'))) {
        debug(dockerAuthData);
        logger.info('Using cached ECR authorization token');
        return callback(null, AuthDataExtractLogin(dockerAuthData));
    } else {
        logger.info('Getting ECR authorization token');
        const ecr = new AWS.ECR();
        ecr.getAuthorizationToken({}, (err, data) => {
            if(ERR(err, callback)) return;
            dockerAuthData = data.authorizationData[0];
            debug('dockerAuthData', dockerAuthData);
            return callback(null, AuthDataExtractLogin(dockerAuthData));
        });
    }
};

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

        if (typeof(this.registry) !== 'undefined') {
            combined = this.registry + '/';
        }
        combined += this.repository;
        return combined;
    }
    getCombined(latestTag=false) {
        var combined = '';

        if (typeof(this.registry) !== 'undefined') {
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
    docker.listImages(function(err, list) {
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
    ecr.describeRepositories({repositoryNames: [repo]}, (err, data) => {
        if (ERR(err, callback)) return;

        var repository_found = _.find(data.repositories, ['repositoryName', repo]);
        if (!repository_found) {

            var params = {
                repositoryName: repo,
            };
            job.info('ECR: Creating repo ' + repo);
            ecr.createRepository(params, (err) => {
                if (ERR(err, callback)) return;
                callback(null);
            });
        } else {
            // Already exists, nothing to do
            callback(null);
        }
    });
}

dockerUtil.pullAndPushToECR = function(image, dockerAuth, job, callback) {
    debug(`pullAndPushtoECR for ${image}`);

    if (!config.externalGradingImageRepository) {
        return callback(new Error('externalGradingImageRepository not defined'));
    }

    var repository = new dockerUtil.DockerName(image);
    const params = {
        fromImage: repository.getRepository(),
        tag: repository.getTag() || 'latest',
    };
    job.info(`Pulling ${repository.getCombined()}`);
    docker.createImage({}, params, (err, stream) => {
    if (ERR(err, callback)) return;

        // For development I prefer stream.pipe, but the event handler works in prod
        //stream.pipe(process.stdout);
        //stream.resume();
        stream.on('data', function(text) {job.addToStdout(text);});
        stream.on('error', function(text) {job.addToStderr(text);});
        stream.on('end', () => {
            job.info('Pull complete');

            // Find the image we just downloaded
            locateImage(repository.getCombined(true), (err, localImage) => {
                if (ERR(err, callback)) return;

                // Tag the image to add the new registry
                repository.registry = config.externalGradingImageRepository;

                var options = {
                    repo: repository.getCombined(),
                };

                localImage.tag(options, (err) => {
                    if (ERR(err, callback)) return;

                    confirmOrCreateECRRepo(repository.getRepository(), job, (err) => {
                        if (ERR(err, callback)) return;

                        // Create a new docker image instance with the new registry name
                        // localImage isn't specific enough to the ECR repo
                        var pushImage = new Docker.Image(docker.modem, repository.getCombined());

                        job.info(`Pushing ${repository.getCombined()}`);
                        pushImage.push({}, (err, stream) => {
                            if (ERR(err, callback)) return;
                            //stream.pipe(process.stdout);
                            //stream.resume();
                            stream.on('data', function(text) {job.addToStdout(text);});
                            stream.on('error', function(text) {job.addToStderr(text);});
                            stream.on('end', () => {
                                job.info('Push complete\n');
                                callback(null);
                            });
                        }, dockerAuth);
                    });
                });
            });
        });
    });
};

module.exports = dockerUtil;
