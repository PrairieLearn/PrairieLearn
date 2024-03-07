# `@prairielearn/aws-imds`

Utilities for fetching data from the [AWS EC2 Instance Metadata Service (IMDS)](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/instancedata-data-retrieval.html).

## Usage

```ts
import { fetchImdsText, fetchImdsJson } from '@prairielearn/aws-imds';

const hostname = await fetchImdsText('/latest/meta-data/hostname');
const identity = await fetchImdsJson('/latest/dynamic/instance-identity/document');
```

You can also use convenience functions to fetch data from common endpoints. The data is internally validated with Zod before being returned.

```ts
import { fetchInstanceHostname, fetchInstanceIdentity } from '@prairielearn/aws-imds';

const hostname = await fetchInstanceHostname();
const identity = await fetchInstanceIdentity();
```
