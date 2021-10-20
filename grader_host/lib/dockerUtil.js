const ERR = require('async-stacktrace');
const AWS = require('aws-sdk');
const debug = require('debug')('PrairieGrader:dockerUtil');

module.exports.setupDockerAuth = function (callback) {
  const ecr = new AWS.ECR();
  ecr.getAuthorizationToken({}, (err, data) => {
    if (ERR(err, callback)) return;
    //debug(data);
    let buff = Buffer.from(data.authorizationData[0].authorizationToken, 'base64');
    let authString = buff.toString('ascii');
    let authArray = authString.split(':');

    var auth = {
      username: authArray[0],
      password: authArray[1],
    };
    debug(auth);
    return callback(null, auth);
  });
};

module.exports.DockerName = class DockerName {
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
