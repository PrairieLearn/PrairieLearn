import { once } from 'node:events';
import { createServer } from 'node:http';

import { type WebSocket, WebSocketServer } from 'ws';

import {
  type Command,
  CommandSchema,
  type ConversationEvent,
  type Snapshot,
} from '@prairielearn/course-agent-protocol';

/** Scripted public service for PL gateway/browser tests; real SDK coverage lives in course-agent. */
export class CourseAgentTestService {
  readonly conversations = new Map<string, Snapshot>();
  readonly commands: { id: string; command: Command }[] = [];
  readonly authorizations: (string | undefined)[] = [];
  failCreation = false;
  dropNextAcknowledgement = false;
  private readonly sockets = new Map<WebSocket, { id: string; mode?: 'full' | 'summary' }>();
  private readonly upgrades = new WebSocketServer({ noServer: true });
  private readonly server = createServer((req, res) => {
    this.authorizations.push(req.headers.authorization);
    if (req.headers.authorization !== 'Bearer test-service-token') {
      res.writeHead(401).end();
      return;
    }
    const url = new URL(req.url ?? '/', 'http://localhost');
    if (req.method === 'POST' && url.pathname === '/conversations') {
      if (this.failCreation) {
        res.writeHead(500).end('private service details');
        return;
      }
      const id = this.create();
      res.writeHead(201, { 'Content-Type': 'application/json' }).end(JSON.stringify({ id }));
      return;
    }
    const match = /^\/conversations\/([^/]+)\/snapshot$/.exec(url.pathname);
    const snapshot = match && this.conversations.get(match[1]);
    if (!snapshot) {
      res.writeHead(404).end();
      return;
    }
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(snapshot));
  });

  url = '';

  async start() {
    this.server.on('upgrade', (req, socket, head) => {
      this.authorizations.push(req.headers.authorization);
      if (req.headers.authorization !== 'Bearer test-service-token') {
        socket.destroy();
        return;
      }
      const match = /^\/conversations\/([^/]+)\/socket$/.exec(req.url ?? '');
      if (!match || !this.conversations.has(match[1])) {
        socket.destroy();
        return;
      }
      const id = match[1];
      this.upgrades.handleUpgrade(req, socket, head, (ws) => {
        this.sockets.set(ws, { id });
        ws.on('close', () => this.sockets.delete(ws));
        ws.on('message', (raw) => {
          const command = CommandSchema.parse(JSON.parse(raw.toString()));
          this.commands.push({ id, command });
          const snapshot = this.conversations.get(id)!;
          let result = {};
          switch (command.method) {
            case 'conversation.subscribe':
              this.sockets.set(ws, { id, mode: command.params.mode });
              ws.send(
                JSON.stringify(
                  command.params.mode === 'summary'
                    ? {
                        type: 'event',
                        event: 'conversation.status_changed',
                        data: snapshot.summary,
                      }
                    : { type: 'event', event: 'conversation.snapshot', data: snapshot },
                ),
              );
              break;
            case 'turn.start': {
              if (!snapshot.summary.capabilities.send) {
                ws.send(
                  JSON.stringify({
                    type: 'error',
                    ref: command.ref,
                    code: 409,
                    message: 'The agent is still replying.',
                  }),
                );
                return;
              }
              const turnId = crypto.randomUUID();
              const messageId = crypto.randomUUID();
              snapshot.messages.push({
                id: messageId,
                role: 'user',
                parts: [{ type: 'text', text: command.params.text, state: 'done' }],
              });
              this.emit(id, {
                type: 'event',
                event: 'message.completed',
                data: snapshot.messages.at(-1)!,
              });
              Object.assign(snapshot.summary, {
                activeTurnId: turnId,
                status: 'waiting_for_agent',
                error: null,
                capabilities: { send: false, stop: true, resume: false },
              });
              this.status(id);
              result = { turnId, messageId };
              break;
            }
            case 'turn.stop':
              if (snapshot.summary.activeTurnId === command.params.turnId) this.finish(id);
              break;
            case 'conversation.resume':
              Object.assign(snapshot.summary, {
                status: 'waiting_for_user',
                error: null,
                capabilities: { send: true, stop: false, resume: false },
              });
              this.status(id);
              break;
          }
          if (this.dropNextAcknowledgement && command.method === 'turn.start') {
            this.dropNextAcknowledgement = false;
            ws.close();
            return;
          }
          ws.send(JSON.stringify({ type: 'result', ref: command.ref, result }));
        });
      });
    });
    this.server.listen(0, '127.0.0.1');
    await once(this.server, 'listening');
    const address = this.server.address();
    if (typeof address !== 'object' || !address) throw new Error('Missing test service address');
    this.url = `http://127.0.0.1:${address.port}`;
  }

  async close() {
    for (const ws of this.sockets.keys()) ws.terminate();
    this.upgrades.close();
    this.server.close();
    await once(this.server, 'close');
  }

  create() {
    const id = crypto.randomUUID();
    this.conversations.set(id, {
      messages: [],
      hasMore: false,
      summary: {
        revision: 0,
        status: 'offline',
        activeTurnId: null,
        latestAssistantMessageId: null,
        error: null,
        capabilities: { send: true, stop: false, resume: false },
      },
    });
    return id;
  }

  private emit(id: string, event: ConversationEvent) {
    for (const [ws, observation] of this.sockets) {
      if (observation.id !== id || !observation.mode) continue;
      if (observation.mode === 'summary' && event.event !== 'conversation.status_changed') continue;
      ws.send(JSON.stringify(event));
    }
  }

  private status(id: string) {
    const snapshot = this.conversations.get(id)!;
    snapshot.summary.revision++;
    this.emit(id, { type: 'event', event: 'conversation.status_changed', data: snapshot.summary });
  }

  advance(id: string, text: string) {
    const snapshot = this.conversations.get(id)!;
    if (snapshot.messages.at(-1)?.role !== 'assistant') {
      const messageId = crypto.randomUUID();
      snapshot.messages.push({
        id: messageId,
        role: 'assistant',
        parts: [{ type: 'text', text: '', state: 'streaming' }],
      });
      this.emit(id, {
        type: 'event',
        event: 'message.part_updated',
        data: {
          turnId: snapshot.summary.activeTurnId!,
          messageId,
          partIndex: 0,
          part: { type: 'text', text: '', state: 'streaming' },
        },
      });
    }
    const message = snapshot.messages.at(-1)!;
    message.parts[0].text += text;
    this.emit(id, {
      type: 'event',
      event: 'message.delta',
      data: { turnId: snapshot.summary.activeTurnId!, messageId: message.id, partIndex: 0, text },
    });
  }

  finish(id: string) {
    const snapshot = this.conversations.get(id)!;
    const turnId = snapshot.summary.activeTurnId!;
    const message = snapshot.messages.at(-1)!;
    if (message.role === 'assistant') {
      message.parts.forEach((part) => (part.state = 'done'));
      this.emit(id, { type: 'event', event: 'message.completed', data: message });
      snapshot.summary.latestAssistantMessageId = message.id;
    }
    Object.assign(snapshot.summary, {
      activeTurnId: null,
      status: 'waiting_for_user',
      capabilities: { send: true, stop: false, resume: false },
    });
    this.status(id);
    this.emit(id, {
      type: 'event',
      event: 'turn.finished',
      data: { turnId, outcome: 'completed', error: null },
    });
  }

  observers(id: string) {
    return [...this.sockets.values()].filter((entry) => entry.id === id && entry.mode).length;
  }

  disconnect(id: string) {
    for (const [ws, observation] of this.sockets) {
      if (observation.id === id && observation.mode) ws.close();
    }
  }
}
