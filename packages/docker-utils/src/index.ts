import AWS from 'aws-sdk';
import moment from 'moment';
import util from 'util';
import { logger } from '@prairielearn/logger';

// @ts-expect-error
import mmm from 'aws-sdk/lib/maintenance_mode_message';
mmm.suppress = true;

interface DockerAuth {
  username: string;
  password: string;
}

let dockerAuthData: DockerAuth | null = null;
let dockerAuthDataExpiresAt: Date | null | undefined = null;

function authDataExtractLogin(data: AWS.ECR.AuthorizationData): DockerAuth {
  const token = data.authorizationToken;
  if (!token) {
    throw new Error('No authorization token in ECR authorization data');
  }
  const buff = Buffer.from(token, 'base64');
  const authString = buff.toString('ascii');
  const authArray = authString.split(':');

  return {
    username: authArray[0],
    password: authArray[1],
  };
}

export async function setupDockerAuthAsync(
  imageRegistry: string | null | undefined
): Promise<DockerAuth | null> {
  if (!imageRegistry) return null;

  // If we have cached data that's not within an hour of expiring, use it.
  if (
    dockerAuthData &&
    dockerAuthDataExpiresAt &&
    moment().isBefore(moment(dockerAuthDataExpiresAt).subtract(1, 'hour'))
  ) {
    logger.info('Using cached ECR authorization token');
    return dockerAuthData;
  }

  logger.info('Getting ECR authorization token');
  const ecr = new AWS.ECR();
  const data = await ecr.getAuthorizationToken({}).promise();
  const authorizationData = data.authorizationData;
  if (!authorizationData) {
    throw new Error('No authorization data in ECR response');
  }

  dockerAuthData = authDataExtractLogin(authorizationData[0]);
  dockerAuthDataExpiresAt = authorizationData[0].expiresAt;

  return dockerAuthData;
}

export const setupDockerAuth = util.callbackify(setupDockerAuthAsync);

/**
 * Borrowed from https://github.com/apocas/dockerode/blob/master/lib/util.js
 * but turned into a class to manipulate which part of the docker image name
 * we need.
 */
export class DockerName {
  protected original: string;
  protected registry: string | undefined;
  protected repository: string;
  protected tag: string | undefined;

  constructor(name: string) {
    this.original = name;
    this.registry = undefined;
    this.repository = name;
    this.tag = undefined;

    // Parse name into the object parts
    const digestPos = name.indexOf('@');
    const colonPos = name.lastIndexOf(':');

    // @ symbol is more important
    let separatorPos;
    if (digestPos >= 0) {
      separatorPos = digestPos;
    } else if (colonPos >= 0) {
      separatorPos = colonPos;
    }

    if (separatorPos) {
      // last colon is either the tag (or part of a port designation)
      const tag = name.slice(separatorPos + 1);

      // if it contains a / its not a tag and is part of the url
      if (tag.indexOf('/') === -1) {
        this.repository = name.slice(0, separatorPos);
        this.tag = tag;
      }
    }

    const slashes = this.repository.split('/');
    if (slashes.length > 2) {
      this.registry = slashes.slice(0, -2).join('/');
      this.repository = slashes.slice(-2).join('/');
    }
  }

  setRegistry(registry: string | undefined) {
    this.registry = registry;
  }

  getRepository() {
    return this.repository;
  }

  getTag() {
    return this.tag;
  }

  getRegistryRepo() {
    let combined = '';
    if (typeof this.registry !== 'undefined') {
      combined = this.registry + '/';
    }
    combined += this.repository;
    return combined;
  }

  getCombined(latestTag = false) {
    let combined = '';
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
}
