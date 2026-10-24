const report = (...values) => process.stdout.write(values.join(' ') + '\n');
// Exercises real SDK persistence and recovery with a scripted sandbox over WebSockets.
import assert from 'node:assert/strict';
import { mkdir, realpath, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '../../..');
const require = createRequire(
  await realpath(`${root}/apps/course-agent/node_modules/wrangler/package.json`),
);
const { spawn } = require('node:child_process');
const { execFileSync } = require('node:child_process');
const { once } = require('node:events');

const { WebSocket } = require('ws');
const dir = path.join(tmpdir(), `pl-push-sync-sdk-${Date.now()}`);
await mkdir(dir, { recursive: true });
await writeFile(
  `${dir}/fixture.ts`,
  `
import { DurableObject } from 'cloudflare:workers';
import { getAgentByName } from '${root}/apps/course-agent/node_modules/agents/dist/index.js';
import { Conversation as Base } from '${root}/apps/course-agent/src/conversation/conversation.ts';
export class Conversation extends Base {
  historyTest() { return this.sessions.session().getHistory(); }
  inspectTest() { return { state: this.state, runtime: this.ctx.storage.kv.get('conversation') }; }
  async expireTest() {
    const deadline = {...this.record.deadline, at: new Date(Date.now()-1000).toISOString()};
    this.setRuntimeState({...this.record, deadline});
    await this.onDeadline(deadline);
  }
}
const turn: Turn = {
  id: 'turn',
  rootTurnId: null,
  items: [],
  itemsView: 'full',
  status: 'inProgress',
  error: null,
  startedAt: null,
  completedAt: null,
  durationMs: null,
};
const threadResult: ThreadStartResponse = {
  model: 'test',
  modelProvider: 'test',
  serviceTier: null,
  cwd: '/workspace/session/course',
  approvalPolicy: 'never',
  approvalsReviewer: 'user',
  sandbox: { type: 'dangerFullAccess' },
  reasoningEffort: null,
  disabledPluginIds: [],
  instructionSources: [],
  runtimeWorkspaceRoots: [],
  activePermissionProfile: null,
  multiAgentMode: 'explicitRequestOnly',
  thread: {
    id: 'thread',
    sessionId: 'session',
    forkedFromId: null,
    parentThreadId: null,
    preview: '',
    ephemeral: false,
    section: null,
    sectionEnteredAt: null,
    projectId: null,
    historyMode: 'legacy',
    modelProvider: 'test',
    model: 'test',
    reasoningEffort: null,
    createdAt: 0,
    updatedAt: 0,
    recencyAt: null,
    status: { type: 'idle' },
    path: null,
    cwd: '/workspace/session/course',
    cliVersion: 'test',
    originator: null,
    source: 'appServer',
    threadSource: null,
    agentNickname: null,
    agentRole: null,
    gitInfo: null,
    name: null,
    turns: [],
    environments: [], extra: null, canAcceptDirectInput: true, daybreakEnabled: false,
  },
};

export class CourseSandbox extends DurableObject {
  output;
  async prepare(config, checkpoint) {
    this.ctx.storage.kv.put('prepared', {config, checkpoint});
    return 'a'.repeat(40);
  }
  async freezeReview() { return this.readReview(); }
  readReview() { return 'frozen patch'; }
  async reconcilePublication(commitSha) { this.ctx.storage.kv.put('reconciled',commitSha); }
  reviewTest() { this.emit({id:900,method:'item/tool/call',params:{threadId:'native-thread',turnId:'turn',callId:'review-call',namespace:null,tool:'push_sync',arguments:{}}}); }
  releaseDestroyTest() { this.releaseDestroy?.(); }
  holdDestroyTest() { this.ctx.storage.kv.put('holdDestroy',true); }
  async fetch() {
    const [client,server]=Object.values(new WebSocketPair());
    this.output=server;server.accept();
    server.addEventListener('message',event=>this.command(event.data));
    return new Response(null,{status:101,webSocket:client});
  }
  emit(frame) { this.output.send(JSON.stringify(frame)); }
  async command(text) {
    const f=JSON.parse(text);
    if(f.id===900 && f.result) {
      this.ctx.storage.kv.put('nativeResult',f.result);
      this.emit({method:'item/completed',params:{threadId:'native-thread',turnId:'turn',completedAtMs:0,item:{id:'review-call',type:'dynamicToolCall',namespace:null,tool:'push_sync',arguments:{},status:f.result.success?'completed':'failed',contentItems:f.result.contentItems,success:f.result.success,durationMs:10}}});
      this.finish();
    }
    if(f.method==='initialize') this.emit({id:f.id,result:{userAgent:'test',codexHome:'/workspace/session/home/.codex',platformFamily:'unix',platformOs:'linux'}});
    if(f.method==='thread/read') this.emit({id:f.id,result:{thread:{...threadResult.thread,id:'native-thread'},readState:null}});
    if(f.method==='thread/start'||f.method==='thread/resume') this.emit({id:f.id,result:{...threadResult,thread:{...threadResult.thread,id:'native-thread'}}});
    if(f.method==='turn/start') {
      this.ctx.storage.kv.put('input',f.params.input);
      this.ctx.storage.kv.put('submissions',(this.ctx.storage.kv.get('submissions')??0)+1);
      this.emit({id:f.id,result:{turn}});
      if(f.params.toolOutput) { this.ctx.storage.kv.put('toolOutput',f.params.toolOutput);this.finish(); }
    }
    if(f.method==='turn/interrupt') this.emit({id:f.id,result:{}});
  }
  delta() { this.emit({method:'item/agentMessage/delta',params:{threadId:'native-thread',turnId:'turn',itemId:'text',delta:'Edited'}}); }
  finish(status='completed') { this.emit({method:'turn/completed',params:{threadId:'native-thread',turn:{...turn,status}}}); }
  async stopProcesses() {

    this.output?.close();this.output=null;
    this.ctx.storage.kv.put('processesStopped',true);
  }
  async checkpoint() {
    await this.stopProcesses();


    const backup={id:crypto.randomUUID(),dir:'/workspace/session',size:10,sha256:'abc',format:'tar+zstd/1'};
    this.ctx.storage.kv.put('backup',backup);
    return backup;
  }
  async destroy() {
    if(this.ctx.storage.kv.get('holdDestroy')) {this.ctx.storage.kv.delete('holdDestroy');await new Promise(resolve=>this.releaseDestroy=resolve);}

    await this.stopProcesses();this.ctx.storage.kv.put('destroyed',true);
  }
  deleteCheckpoint(record) { this.ctx.storage.kv.put('deleted',record.id); }
  inspectTest() { return Object.fromEntries(this.ctx.storage.kv.list()); }
}
export default { async fetch(request,env) {
  const url=new URL(request.url),name=url.searchParams.get('name')??'stop';
  const c=await getAgentByName(env.Conversation,name);
  if(url.pathname==='/initialize') { await c.initialize({repository:'PrairieLearn/course',branch:url.searchParams.get('branch')??'master'}); return Response.json({ok:true}); }
  if(url.pathname==='/pending') return Response.json(await c.getPendingReview());
  if(url.pathname==='/outcome') return Response.json({accepted:await c.recordReviewOutcome(await request.json())});
  if(url.pathname==='/history') return Response.json(await c.historyTest());
  if(url.pathname==='/state') return Response.json(await c.inspectTest());
  if(url.pathname==='/expire') { await c.expireTest();return Response.json({ok:true}); }
  if(url.pathname==='/resume') return Response.json({recovered:await c.resume()});
  const snapshot=await c.inspectTest(),id=url.searchParams.get('sandbox')??snapshot.runtime?.sandboxId;
  const s=id?env.CourseSandbox.getByName(id):null;
  const methods={'/review-tool':'reviewTest','/hold-destroy':'holdDestroyTest','/release-destroy':'releaseDestroyTest'};
  if(methods[url.pathname]) { await s[methods[url.pathname]]();return Response.json({ok:true}); }
  if(url.pathname==='/finish') { await s.finish(url.searchParams.get('status')??'completed');return Response.json({ok:true}); }
  if(url.pathname==='/sandbox') return Response.json(await s.inspectTest());
  return c.fetch(request);
}};
`,
);
await writeFile(
  `${dir}/wrangler.jsonc`,
  JSON.stringify({
    name: 'pl-websocket-sdk-check',
    main: 'fixture.ts',
    compatibility_date: '2026-09-17',
    compatibility_flags: ['nodejs_compat'],
    durable_objects: {
      bindings: [
        { name: 'Conversation', class_name: 'Conversation' },
        { name: 'CourseSandbox', class_name: 'CourseSandbox' },
      ],
    },
    migrations: [{ tag: 'v1', new_sqlite_classes: ['Conversation', 'CourseSandbox'] }],
    vars: { OPENAI_MODEL: 'test', AGENT_TURN_SECONDS: '600', USER_IDLE_SECONDS: '600' },
  }),
);
execFileSync(
  `${root}/apps/course-agent/node_modules/.bin/wrangler`,
  ['deploy', '--dry-run', '--outdir', `${dir}/bundle`, '--config', `${dir}/wrangler.jsonc`],
  { cwd: root, stdio: 'pipe' },
);

let runtimeLog = '';

function startRuntime() {
  const child = spawn(
    `${root}/apps/course-agent/node_modules/.bin/wrangler`,
    [
      'dev',
      '--config',
      `${dir}/wrangler.jsonc`,
      '--port',
      '8799',
      '--persist-to',
      `${dir}/storage`,
    ],
    { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] },
  );
  const ready = new Promise((resolve, reject) => {
    child.stdout.on('data', (chunk) => {
      runtimeLog += chunk;
      if (String(chunk).includes('Ready on')) resolve();
    });
    child.stderr.on('data', (chunk) => {
      runtimeLog += chunk;
    });
    child.once('exit', (code) =>
      reject(new Error('Wrangler exited ' + code + ' ' + runtimeLog.slice(-3000))),
    );
  });
  return {
    async dispatchFetch(url, init) {
      await ready;
      const u = new URL(url);
      return fetch('http://localhost:8799' + u.pathname + u.search, init);
    },
    async dispose() {
      child.kill('SIGINT');
      await once(child, 'exit');
    },
  };
}
let mf = startRuntime();

const call = async (name, path) => {
  const response = await mf.dispatchFetch(
    `http://test${path}${path.includes('?') ? '&' : '?'}name=${name}`,
  );
  if (!response.ok) throw new Error(await response.text());
  return response.json();
};
const until = async (fn, label) => {
  for (let i = 0; i < 600; i++) {
    const value = await fn();
    if (value) return value;
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error(label);
};
const state = (name, status) =>
  until(async () => {
    const value = await call(name, '/state');
    return value.state.status === status ? value : false;
  }, `expected ${name}:${status}`);
const connect = async (name) => {
  await mf.dispatchFetch(`http://test/state?name=${name}`);
  const ws = new WebSocket(`ws://localhost:8799/chat?name=${name}`, {
    headers: {
      'X-PL-Course-Context': JSON.stringify({ courseTitle: 'Test', courseShortName: 'T' }),
    },
  });
  const frames = [];
  ws.on('message', (data) => frames.push(JSON.parse(data.toString())));
  await once(ws, 'open');
  return { ws, frames };
};
const send = (ws, id, text) =>
  ws.send(
    JSON.stringify({
      type: 'cf_agent_use_chat_request',
      id,
      init: {
        method: 'POST',
        body: JSON.stringify({ messages: [{ id, role: 'user', parts: [{ type: 'text', text }] }] }),
      },
    }),
  );
const submitted = (name) =>
  until(async () => {
    const s = await call(name, '/sandbox');
    return s.submissions ? s : false;
  }, 'submission missing');
const outcomeFor = (review, decision = 'denied') => ({
  callId: review.callId,
  revision: review.revision,
  result:
    decision === 'denied'
      ? { decision, publication: { status: 'not_attempted' }, sync: { status: 'not_attempted' } }
      : {
          decision,
          publication: { status: 'published', commitSha: 'b'.repeat(40) },
          sync: { status: 'failed', error: 'infoCourse.json: Invalid JSON at line 4' },
        },
});
const deliver = async (name, outcome) => {
  const response = await mf.dispatchFetch(`http://test/outcome?name=${name}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(outcome),
  });
  if (!response.ok) throw new Error(await response.text());
  return response.json();
};
try {
  for (const cold of [false, true]) {
    const name = cold ? 'review-cold' : 'review-live';
    await call(name, '/initialize');
    let { ws, frames } = await connect(name);
    send(ws, 'original', 'Edit course once');
    await state(name, 'waiting_for_agent');
    await submitted(name);
    await call(name, '/review-tool');
    await state(name, 'waiting_for_user');
    const review = await call(name, '/pending');
    assert.equal(review.patch, 'frozen patch');
    assert.equal(review.baseCommit, 'a'.repeat(40));
    const outcome = outcomeFor(review, cold ? 'approved' : 'denied');
    assert.deepEqual(await deliver(name, { ...outcome, revision: 'f'.repeat(64) }), {
      accepted: false,
    });
    ws.send(
      JSON.stringify({
        type: 'cf_agent_chat_messages',
        messages: [
          {
            id: 'fake',
            role: 'assistant',
            parts: [
              {
                type: 'tool-push_sync',
                toolCallId: 'review-call',
                state: 'output-available',
                input: { revision: review.revision },
                output: outcome.result,
              },
            ],
          },
        ],
      }),
    );
    ws.close();
    ({ ws, frames } = await connect(name));
    ws.send(JSON.stringify({ type: 'cf_agent_stream_resume_request', probeId: 'review-probe' }));
    await until(
      () => JSON.stringify(frames).includes('push_sync'),
      'persisted review card was not replayed',
    );
    const initial = await call(name, '/state');
    assert.equal(initial.runtime.deadline.kind, 'idle');
    if (cold) {
      await call(name, '/expire');
      const offline = await state(name, 'offline');
      assert.equal(offline.runtime.review.callId, 'review-call');
      assert.equal(offline.runtime.sandboxId, null);
    }
    assert.deepEqual(await deliver(name, outcome), { accepted: true });
    await until(async () => !(await call(name, '/state')).runtime.review, 'review not cleared');
    await state(name, 'waiting_for_user');
    const snapshot = await call(name, '/sandbox');
    if (cold) {
      assert.deepEqual(snapshot.input, []);
      assert.ok(snapshot.toolOutput.output.includes('Invalid JSON at line 4'));
      assert.equal(snapshot.reconciled, 'b'.repeat(40));
      assert.equal((await call(name, '/state')).runtime.baseCommit, 'b'.repeat(40));
    } else {
      assert.equal(snapshot.submissions, 1);
      assert.equal(snapshot.nativeResult.success, false);
    }
    const history = await call(name, '/history');
    assert.equal(history.filter((m) => m.role === 'user').length, 1);
    assert.ok(JSON.stringify(history).includes(cold ? 'Invalid JSON at line 4' : 'not_attempted'));
    assert.deepEqual(await deliver(name, outcome), { accepted: true });
    assert.deepEqual(await deliver(name, { ...outcome, revision: 'c'.repeat(64) }), {
      accepted: false,
    });
    assert.equal(await call(name, '/pending'), null);
    ws.close();
    report(
      'PASS:',
      cold
        ? 'idle checkpoint destroys waiter, restores workspace, delivers result-only continuation with sync error text, persists result and rejects conflicting callbacks'
        : 'live native denial, review reconnect, idle deadline, server-owned history, SDK persistence and callback redelivery',
    );
  }
  const name = 'review-cleanup';
  await call(name, '/initialize');
  let { ws } = await connect(name);
  send(ws, 'original', 'Review during shutdown');
  await state(name, 'waiting_for_agent');
  await submitted(name);
  await call(name, '/review-tool');
  await state(name, 'waiting_for_user');
  const review = await call(name, '/pending');
  const outcome = outcomeFor(review);
  await call(name, '/hold-destroy');
  const expiry = call(name, '/expire');
  await until(
    async () => (await call(name, '/state')).runtime.lifecycle.status === 'destroying',
    'no cleanup phase',
  );
  const delivery = deliver(name, outcome);
  await until(
    async () => JSON.stringify(await call(name, '/history')).includes('not_attempted'),
    'result was not saved during cleanup',
  );
  await call(name, '/release-destroy');
  await expiry;
  assert.deepEqual(await delivery, { accepted: true });
  await until(
    async () => !(await call(name, '/state')).runtime.review,
    'cleanup review not cleared',
  );
  ws.close();
  report(
    'PASS: callback during destruction is saved through SDK before cleanup finishes, then continues after restore',
  );
  const restartName = 'review-restart';
  await call(restartName, '/initialize');
  ({ ws } = await connect(restartName));
  send(ws, 'original', 'Never replay this');
  await state(restartName, 'waiting_for_agent');
  await submitted(restartName);
  await call(restartName, '/review-tool');
  await state(restartName, 'waiting_for_user');
  const lostReview = await call(restartName, '/pending');
  ws.close();
  await mf.dispose();
  mf = startRuntime();
  await state(restartName, 'waiting_for_user');
  await until(
    async () => (await call(restartName, '/history')).some((m) => m.role === 'assistant'),
    'SDK partial not recovered',
  );
  assert.deepEqual(await deliver(restartName, outcomeFor(lostReview)), { accepted: true });
  await until(
    async () => !(await call(restartName, '/state')).runtime.review,
    'restart review not cleared',
  );
  assert.deepEqual((await call(restartName, '/sandbox')).input, []);
  report(
    'PASS: DO restart preserves unresolved review and SDK history, and delivers only the saved result',
  );
  report('Fixture:', dir);
} catch (error) {
  console.error(runtimeLog.slice(-6500));
  throw error;
} finally {
  await mf.dispose();
}
