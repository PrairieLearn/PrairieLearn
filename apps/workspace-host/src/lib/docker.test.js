// @ts-check
import { assert } from 'chai';

import { parseDockerLogs } from './docker';

// See "Stream format" docs on the Docker ContainerAttach API:
// https://docs.docker.com/engine/api/v1.41/#tag/Container/operation/ContainerAttach
describe('parseDockerLogs', () => {
  it('handles empty case', () => {
    assert.deepEqual(parseDockerLogs(Buffer.from([])), Buffer.from([]));
  });

  it('handles one line of stdout', () => {
    // 8-byte header + 13-byte string
    const input = Buffer.alloc(21, 0);
    input.writeUInt32BE(1, 0);
    input.writeUInt32BE(13, 4);
    input.write('hello world!\n', 8);
    assert.deepEqual(parseDockerLogs(input).toString(), 'hello world!\n');
  });

  it('handles missing bytes at the end', () => {
    // 8-byte header + 5 byte string
    const input = Buffer.alloc(13, 0);
    input.writeUInt32BE(1, 0);
    // Lie and claim that there are 13 bytes here
    input.writeUInt32BE(13, 4);
    input.write('hello', 8);
    assert.deepEqual(parseDockerLogs(input).toString(), 'hello');
  });

  it('handles truncated header', () => {
    // 8-byte header + 5 byte string + partial 4-byte header
    const input = Buffer.alloc(17, 0);
    input.writeUInt32BE(1, 0);
    input.writeUInt32BE(5, 4);
    input.write('hello', 8);
    input.writeUInt32BE(1, 13);
    assert.deepEqual(parseDockerLogs(input).toString(), 'hello');
  });
});
