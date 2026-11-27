import { S3 } from '@aws-sdk/client-s3';

// This bootstrap script only connects to the local RustFS instance.
// oxlint-disable-next-line @prairielearn/aws-client-shared-config
const s3 = new S3({
  region: 'us-east-1',
  endpoint: 'http://127.0.0.1:5000',
  forcePathStyle: true,
  credentials: { accessKeyId: 'rustfsadmin', secretAccessKey: 'rustfsadmin' },
});

const existingBuckets = new Set((await s3.listBuckets()).Buckets?.map((bucket) => bucket.Name));
for (const Bucket of ['workspaces', 'chunks', 'file-store', 'workspace-logs']) {
  if (!existingBuckets.has(Bucket)) {
    try {
      await s3.createBucket({ Bucket });
    } catch (error) {
      if (error.name !== 'BucketAlreadyOwnedByYou') throw error;
    }
  }
}
