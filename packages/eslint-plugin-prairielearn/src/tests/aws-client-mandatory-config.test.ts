import { RuleTester } from '@typescript-eslint/rule-tester';

import rule from '../rules/aws-client-mandatory-config';

RuleTester.afterAll = after;

const ruleTester = new RuleTester();

ruleTester.run('aws-client-mandatory-config', rule, {
  valid: [
    {
      code: "import { S3 } from '@aws-sdk/client-s3'; new S3({ region: 'us-west-2' })",
    },
    {
      code: "import { S3 } from '@aws-sdk/client-s3'; new S3({ region: 'us-west-2', accessKeyId: 'foo' })",
    },
  ],
  invalid: [
    {
      code: "import { S3 } from '@aws-sdk/client-s3'; new S3()",
      errors: [{ messageId: 'missingConfig' }],
    },
  ],
});
