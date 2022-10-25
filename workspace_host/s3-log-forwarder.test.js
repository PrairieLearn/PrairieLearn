const { assert } = require('chai');

const { demuxOutput } = require('./s3-log-forwarder');

// See "Stream format" docs on the Docker ContainerAttach API:
// https://docs.docker.com/engine/api/v1.41/#tag/Container/operation/ContainerAttach
describe('demuxOutput', () => {
  it('handles empty case', () => {
    assert.deepEqual(demuxOutput(Buffer.from([])), Buffer.from([]));
  });

  it('handles one line of stdout', () => {
    // 8-byte header + 13-byte string
    const input = Buffer.alloc(21, 0);
    input.writeUInt32BE(1, 0);
    input.writeUInt32BE(13, 4);
    input.write('hello world!\n', 8);
    assert.deepEqual(demuxOutput(input).toString(), 'hello world!\n');
  });

  it('handles missing bytes at the end', () => {
    // 8-byte header + 5 byte string
    const input = Buffer.alloc(13, 0);
    input.writeUInt32BE(1, 0);
    // Lie and claim that there are 13 bytes here
    input.writeUInt32BE(13, 4);
    input.write('hello', 8);
    assert.deepEqual(demuxOutput(input).toString(), 'hello');
  });
});
