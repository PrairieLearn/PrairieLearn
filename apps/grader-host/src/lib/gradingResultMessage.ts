function serializeSqsMessage(message: object): string {
  // JSON.stringify escapes control characters and lone surrogates, but SQS also
  // rejects these two noncharacters when they appear literally.
  return JSON.stringify(message).replaceAll('\ufffe', '\\ufffe').replaceAll('\uffff', '\\uffff');
}

export function serializeGradingResultMessage(jobId: string, results: unknown): string {
  const notification = { jobId, event: 'grading_result' };
  const messageBody = serializeSqsMessage({ ...notification, data: results });

  // Keep the inline message within the existing 250 KiB budget, including the
  // envelope and Unicode escapes. Larger results are fetched from S3.
  if (Buffer.byteLength(messageBody, 'utf8') <= 250 * 1024) {
    return messageBody;
  }

  return serializeSqsMessage(notification);
}
