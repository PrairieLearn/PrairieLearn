import { RuleTester } from '@typescript-eslint/rule-tester';
import { afterAll, describe, it } from 'vitest';

import rule from '../rules/aws-client-shared-config';

RuleTester.afterAll = afterAll;
RuleTester.describe = describe;
RuleTester.it = it;

const ruleTester = new RuleTester();

ruleTester.run('aws-client-shared-config', rule, {
  valid: [
    {
      code: "import { S3 } from '@aws-sdk/client-s3'; new S3(makeS3ClientConfig());",
    },
    {
      code: "import { S3Client } from '@aws-sdk/client-s3'; new S3Client(makeS3ClientConfig());",
    },
    {
      code: "import { EC2 } from '@aws-sdk/client-ec2'; new EC2(makeAwsClientConfig());",
    },
    {
      code: "import { EC2Client } from '@aws-sdk/client-ec2'; new EC2Client(makeAwsClientConfig());",
    },
    {
      code: "import { EC2 } from '@aws-sdk/client-ec2'; new EC2(aws.makeAwsClientConfig());",
    },
  ],
  invalid: [
    {
      code: "import { S3 } from '@aws-sdk/client-s3'; new S3({ region: 'us-east-2' });",
      errors: [{ messageId: 'improperConfig' }],
    },
    {
      code: "import { EC2 } from '@aws-sdk/client-ec2'; new EC2({ region: 'us-east-2' });",
      errors: [{ messageId: 'improperConfig' }],
    },
    {
      code: "import { S3 } from '@aws-sdk/client-s3'; new S3(wrongFunction());",
      errors: [{ messageId: 'improperConfig' }],
    },
  ],
});
