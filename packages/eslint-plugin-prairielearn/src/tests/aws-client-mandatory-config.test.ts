import { RuleTester } from '@typescript-eslint/rule-tester';
import { afterAll, describe, it } from 'vitest';

import rule from '../rules/aws-client-mandatory-config';

RuleTester.afterAll = afterAll;
RuleTester.describe = describe;
RuleTester.it = it;

const ruleTester = new RuleTester();

ruleTester.run('aws-client-mandatory-config', rule, {
  valid: [
    {
      code: "import { S3 } from '@aws-sdk/client-s3'; new S3({ region: 'us-east-2' })",
    },
    {
      code: "import { S3Client } from '@aws-sdk/client-s3'; new S3Client({ region: 'us-east-2' })",
    },
    {
      code: "import { EC2 } from '@aws-sdk/client-ec2'; new EC2({ region: 'us-east-2' })",
    },
    {
      code: "import { EC2Client } from '@aws-sdk/client-ec2'; new EC2Client({ region: 'us-east-2' })",
    },
  ],
  invalid: [
    {
      code: "import { S3 } from '@aws-sdk/client-s3'; new S3()",
      errors: [{ messageId: 'missingConfig' }],
    },
  ],
});
