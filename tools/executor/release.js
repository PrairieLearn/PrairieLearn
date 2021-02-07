#!/usr/bin/env node
// @ts-check
const AWS = require('aws-sdk');

const { execa, getImageName } = require('./util');

// TODO: maybe make this configurable via a command line arg?
const REGION = 'us-east-2';

AWS.config.update({ region: REGION });

(async () => {
  const imageName = await getImageName();

  console.log('Pushing image to Docker registry');
  await execa('docker', ['push', imageName]);

  // ECR registries are tied to account IDs. Determine the account ID dynamically
  // based on the credentials we're running with.
  const sts = new AWS.STS();
  const { Account: accountId } = await sts.getCallerIdentity().promise();

  const ecrRegistryUrl = `https://${accountId}.dkr.ecr.${REGION}.amazonaws.com`;

  const ecr = new AWS.ECR();
  const authData = await ecr.getAuthorizationToken().promise();
  const token = authData.authorizationData[0].authorizationToken;
  const [user, password] = Buffer.from(token, 'base64').toString().split(':');

  console.log('Pushing image to ECR registry');
  await execa('docker', ['login', '--username', user, '--password-stdin', ecrRegistryUrl], { input: password });
  const ecrImageName = `${ecrRegistryUrl}/${imageName}`;
  await execa('docker', ['tag', imageName, ecrImageName]);
  await execa('docker', ['push', ecrImageName]);
})().catch(e => {
  console.error(e);
  process.exit(1);
});
