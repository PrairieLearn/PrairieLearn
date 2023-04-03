# `@prairielearn/aws-imds`

Utilities for fetching data from the [AWS EC2 Instance Metadata Service (IMDS)](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/instancedata-data-retrieval.html).

## Usage

```ts
import { imdsFetchText, imdsFetchJson } from '@prairielearn/aws-imds';

const hostname = await imdsFetchText('/latest/meta-data/hostname');
const identity = await imdsFetchJson('/latest/dynamic/instance-identity/document');
```
