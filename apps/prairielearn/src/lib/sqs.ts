import { GetQueueUrlCommand, type SQSClient } from '@aws-sdk/client-sqs';

/**
 * Resolves an SQS queue name to its URL.
 */
export async function getQueueUrl(sqs: SQSClient, queueName: string): Promise<string> {
  const data = await sqs.send(new GetQueueUrlCommand({ QueueName: queueName }));
  if (!data.QueueUrl) {
    throw new Error(`Could not get URL for queue ${queueName}`);
  }
  return data.QueueUrl;
}
