import { assert } from 'chai';
import { S3, S3Client } from '@aws-sdk/client-s3';
import { EC2 } from '@aws-sdk/client-ec2';

import { getAwsClient } from './aws';

describe('aws client cache', () => {
  it('returns the same client for the same config', () => {
    const clientA = getAwsClient(S3, { region: 'us-east-1' });
    const clientB = getAwsClient(S3, { region: 'us-east-1' });

    assert.instanceOf(clientA, S3);
    assert.instanceOf(clientB, S3);
    assert.strictEqual(clientA, clientB);
  });

  it('returns different clients for different configs', () => {
    const clientA = getAwsClient(S3, { region: 'us-east-1' });
    const clientB = getAwsClient(S3, { region: 'us-west-1' });

    assert.instanceOf(clientA, S3);
    assert.instanceOf(clientB, S3);
    assert.notStrictEqual(clientA, clientB);
  });

  it('returns different clients for different classes', () => {
    const clientA = getAwsClient(S3, { region: 'us-east-1' });
    const clientB = getAwsClient(EC2, { region: 'us-east-1' });

    assert.instanceOf(clientA, S3);
    assert.instanceOf(clientB, EC2);
  });

  it('works for both client and service classes', () => {
    const clientA = getAwsClient(S3, { region: 'us-east-1' });
    const clientB = getAwsClient(S3Client, { region: 'us-east-1' });

    assert.instanceOf(clientA, S3);
    assert.instanceOf(clientA, S3Client);
    assert.instanceOf(clientB, S3Client);
  });
});
