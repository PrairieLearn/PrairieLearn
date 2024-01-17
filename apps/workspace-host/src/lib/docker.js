// @ts-check

/**
 * Converts Docker's custom multiplexed stream format into a normal string.
 * This essentially entails removing each 8-byte header.
 *
 * For more information about this format, see
 * https://docs.docker.com/engine/api/v1.41/#tag/Container/operation/ContainerAttach
 * https://github.com/apocas/dockerode/issues/456
 * https://github.com/moby/moby/issues/32794
 *
 * @param {Buffer} buffer
 * @returns {Buffer}
 */
export function parseDockerLogs(buffer) {
  let outputChunks = [];

  while (buffer.length > 0) {
    // Ensure that we gracefully handle the case where we have a partial header.
    // In that case, we'll just discard the rest of the buffer.
    const header = bufferSlice(8);
    if (header.length < 8) break;

    // The header contains both the stream type (stdin/stdout/stderr) and the
    // length of the data that follows. We won't differentiate between stdout
    // and stderr, so we'll just ignore that byte.
    const dataLength = header.readUInt32BE(4);

    const content = bufferSlice(dataLength);
    outputChunks.push(content);
  }

  function bufferSlice(end) {
    const out = buffer.subarray(0, end);
    buffer = buffer.subarray(end, buffer.length);
    return out;
  }

  return Buffer.concat(outputChunks);
}
