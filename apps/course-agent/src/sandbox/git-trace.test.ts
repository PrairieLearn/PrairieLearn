import { describe, expect, it } from 'vitest';

import { summarizeGitTraces } from './git-trace.js';

const PERF = `
16:21:05.985505 run-command.c:739            | d0 | main                     | child_start  |     |  0.007723 |           |              | [ch0] class:remote-http argv:[git remote-http origin http://repository.internal/Org/course.git]
16:21:06.460214 fetch-pack.c:790             | d0 | main                     | region_leave |     |  0.482435 |  0.000255 | fetch-pack   | label:parse_remote_refs_and_find_cutoff
16:21:06.623345 run-command.c:739            | d0 | main                     | child_start  |     |  0.645556 |           |              | [ch1] class:? argv:[git --shallow-file /workspace/session/course/.git/shallow.lock index-pack --stdin --fix-thin]
16:21:16.700000 progress.c:346               | d1 | main                     | region_leave | r1  | 10.100000 | 10.000000 | progress     | label:Receiving objects
16:21:17.700000 progress.c:346               | d1 | main                     | region_leave | r1  | 11.100000 |  1.000000 | progress     | label:Resolving deltas
16:21:17.731607 run-command.c:995            | d0 | main                     | child_exit   |     | 11.753827 | 11.108271 |              | [ch1] pid:10 code:0
16:21:47.725831 run-command.c:995            | d0 | main                     | child_exit   |     | 41.739532 | 41.738382 |              | [ch0] pid:8 code:0
16:21:48.740382 read-cache.c:3138            | d0 | main                     | region_leave | r1  | 42.762603 |  0.015000 | index        | label:do_write_index /workspace/session/course/.git/index.lock
16:21:48.740438 git.c:783                    | d0 | main                     | exit         |     | 42.762659 |           |              | code:0
`;

const CURL = `
16:21:05.993464 http.c:912              == Info: Could not find host repository.internal in the .netrc file; using defaults
16:21:06.461756 http.c:871              => Send header: POST /Org/course.git/git-upload-pack HTTP/1.1
16:21:06.461800 http.c:871              => Send header: Host: repository.internal
16:21:06.461900 http.c:912              == Info: Request completely sent off
16:21:06.620945 http.c:871              <= Recv header: HTTP/1.1 200 OK
16:21:06.621000 http.c:871              <= Recv header: Content-Type: application/x-git-upload-pack-result
16:21:06.621100 http.c:871              <= Recv header: Transfer-Encoding: chunked
16:21:06.621200 http.c:871              <= Recv header: Date: Fri, 06 Nov 2026 16:21:06 GMT
16:21:47.722569 http.c:912              == Info: Connection #0 to host repository.internal left intact
`;

describe('summarizeGitTraces', () => {
  it('merges Git steps and HTTP lifecycle events into one timeline without paths', () => {
    expect(summarizeGitTraces(PERF, CURL)).toEqual([
      { source: 'git', atMs: 0, durationMs: null, text: 'd0 start ch0 remote-http' },
      {
        source: 'http',
        atMs: 476,
        durationMs: null,
        text: 'request POST /Org/course.git/git-upload-pack HTTP/1.1',
      },
      { source: 'http', atMs: 476, durationMs: null, text: 'Request completely sent off' },
      { source: 'http', atMs: 635, durationMs: null, text: 'response HTTP/1.1 200 OK' },
      { source: 'http', atMs: 636, durationMs: null, text: 'response Transfer-Encoding: chunked' },
      { source: 'git', atMs: 638, durationMs: null, text: 'd0 start ch1 index-pack' },
      { source: 'git', atMs: 10_715, durationMs: 10_000, text: 'd1 progress Receiving objects' },
      { source: 'git', atMs: 11_715, durationMs: 1000, text: 'd1 progress Resolving deltas' },
      { source: 'git', atMs: 11_746, durationMs: 11_108, text: 'd0 exit ch1 code:0' },
      {
        source: 'http',
        atMs: 41_737,
        durationMs: null,
        text: 'Connection #0 to host repository.internal left intact',
      },
      { source: 'git', atMs: 41_740, durationMs: 41_738, text: 'd0 exit ch0 code:0' },
      { source: 'git', atMs: 42_755, durationMs: 15, text: 'd0 index do_write_index' },
      { source: 'git', atMs: 42_755, durationMs: null, text: 'd0 process exit code:0' },
    ]);
  });

  it('returns nothing when tracing produced no output', () => {
    expect(summarizeGitTraces('', '')).toEqual([]);
  });
});
