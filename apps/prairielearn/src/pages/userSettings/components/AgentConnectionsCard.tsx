import { type ReactNode, useState } from 'react';
import { Modal, Nav, Tab } from 'react-bootstrap';

import { formatDate } from '@prairielearn/formatter';

interface ConnectedAgent {
  id: string;
  name: string;
  permissions: string[];
  courses: string[];
  created_at: Date;
  last_used_at: Date | null;
  expires_at: Date;
}

export interface AgentConnections {
  serverUrl: string;
  agents: ConnectedAgent[];
  timezone: string;
}

const SERVER_NAME = 'prairielearn';

function CopyButton({ text, label }: { text: string; label: string }) {
  return (
    <button
      type="button"
      className="btn btn-outline-secondary js-copy-button"
      data-clipboard-text={text}
      aria-label={label}
    >
      <i className="bi bi-clipboard" aria-hidden="true" />
    </button>
  );
}

function Command({ text, label }: { text: string; label: string }) {
  return (
    <div className="input-group mt-1 mb-2">
      <input
        type="text"
        className="form-control font-monospace"
        value={text}
        aria-label={label}
        readOnly
      />
      <CopyButton text={text} label={`Copy ${label.toLowerCase()}`} />
    </div>
  );
}

function setupSteps(serverUrl: string): { key: string; title: string; steps: ReactNode[] }[] {
  const cursorConfig = JSON.stringify(
    { mcpServers: { [SERVER_NAME]: { url: serverUrl } } },
    null,
    2,
  );
  return [
    {
      key: 'claude-code',
      title: 'Claude Code',
      steps: [
        <>
          In a terminal, run:
          <Command
            text={`claude mcp add --transport http ${SERVER_NAME} ${serverUrl}`}
            label="Command to add PrairieLearn to Claude Code"
          />
        </>,
        <>
          Start Claude Code, type <code>/mcp</code>, choose <strong>{SERVER_NAME}</strong>, and sign
          in.
        </>,
      ],
    },
    {
      key: 'codex',
      title: 'Codex',
      steps: [
        <>
          In a terminal, run:
          <Command
            text={`codex mcp add ${SERVER_NAME} --url ${serverUrl}`}
            label="Command to add PrairieLearn to Codex"
          />
        </>,
        <>
          Then sign in:
          <Command
            text={`codex mcp login ${SERVER_NAME}`}
            label="Command to sign in to PrairieLearn from Codex"
          />
        </>,
      ],
    },
    {
      key: 'vs-code',
      title: 'VS Code',
      steps: [
        <>
          Open the Command Palette and run <strong>MCP: Add Server</strong>.
        </>,
        <>
          Choose <strong>HTTP</strong>, paste the server address, and name the server{' '}
          <code>{SERVER_NAME}</code>.
        </>,
        <>Allow VS Code to sign in when it asks.</>,
      ],
    },
    {
      key: 'cursor',
      title: 'Cursor',
      steps: [
        <>
          Add this server to <code>~/.cursor/mcp.json</code>:
          <div className="d-flex align-items-start gap-2 mt-1 mb-2">
            <pre className="bg-light border rounded p-2 mb-0 flex-grow-1">
              <code>{cursorConfig}</code>
            </pre>
            <CopyButton text={cursorConfig} label="Copy Cursor configuration" />
          </div>
        </>,
        <>
          Open Cursor's list of MCP servers and sign in to <strong>{SERVER_NAME}</strong>.
        </>,
      ],
    },
    {
      key: 'other',
      title: 'Other',
      steps: [
        <>Add a remote MCP server (Streamable HTTP) with the server address above.</>,
        <>
          Sign in when the agent asks. The agent must support OAuth sign-in; there is no key or
          token to paste.
        </>,
      ],
    },
  ];
}

function DisconnectAgentModal({
  agent,
  csrfToken,
  onClose,
}: {
  agent: ConnectedAgent | null;
  csrfToken: string;
  onClose: () => void;
}) {
  return (
    <Modal show={agent !== null} onHide={onClose}>
      <Modal.Header closeButton>
        <Modal.Title>Disconnect this agent</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <form method="POST" id="disconnect-agent-form">
          <input type="hidden" name="__action" value="agent_disconnect" />
          <input type="hidden" name="__csrf_token" value={csrfToken} />
          <input type="hidden" name="oauth_grant_id" value={agent?.id ?? ''} />
          <p className="mb-0">
            {agent?.name} will no longer be able to use PrairieLearn. To use it again, you will need
            to connect it again.
          </p>
        </form>
      </Modal.Body>
      <Modal.Footer>
        <button type="button" className="btn btn-secondary" onClick={onClose}>
          Cancel
        </button>
        <button type="submit" className="btn btn-danger" form="disconnect-agent-form">
          Disconnect agent
        </button>
      </Modal.Footer>
    </Modal>
  );
}

export function AgentConnectionsCard({
  agentConnections: { serverUrl, agents, timezone },
  csrfToken,
}: {
  agentConnections: AgentConnections;
  csrfToken: string;
}) {
  const [agentToDisconnect, setAgentToDisconnect] = useState<ConnectedAgent | null>(null);
  const agentSetups = setupSteps(serverUrl);

  return (
    <>
      <div className="card mb-4">
        <div className="card-header bg-primary text-white d-flex align-items-center">
          <h2>AI agents</h2>
        </div>
        <div className="card-body">
          <p>
            Connect an AI agent you already use, such as Claude Code or Cursor, to your PrairieLearn
            courses. A connected agent can read course data, sync a course, and read PrairieLearn's
            instructions for writing course content.
          </p>

          <label className="form-label fw-semibold" htmlFor="agent-server-address">
            Server address
          </label>
          <div className="input-group mb-4">
            <input
              type="text"
              className="form-control font-monospace"
              id="agent-server-address"
              value={serverUrl}
              readOnly
            />
            <CopyButton text={serverUrl} label="Copy server address" />
          </div>

          <h3 className="h6">Set up your agent</h3>
          <Tab.Container defaultActiveKey={agentSetups[0].key}>
            <Nav variant="tabs" className="mb-3">
              {agentSetups.map(({ key, title }) => (
                <Nav.Item key={key}>
                  <Nav.Link eventKey={key}>{title}</Nav.Link>
                </Nav.Item>
              ))}
            </Nav>
            <Tab.Content>
              {agentSetups.map(({ key, steps }) => (
                <Tab.Pane key={key} eventKey={key}>
                  <ol className="mb-0">
                    {steps.map((step, index) => (
                      // oxlint-disable-next-line react/no-array-index-key -- The steps are a fixed list.
                      <li key={index}>{step}</li>
                    ))}
                    <li>
                      PrairieLearn opens in your browser. Choose what the agent may do and which
                      courses it may use, then select <strong>Allow</strong>.
                    </li>
                  </ol>
                </Tab.Pane>
              ))}
            </Tab.Content>
          </Tab.Container>
        </div>

        <div className="card-header border-top">
          <h3 className="h6 mb-0">Connected agents</h3>
        </div>
        <ul className="list-group list-group-flush">
          {agents.length === 0 && (
            <li className="list-group-item">
              <span className="text-muted">You don't currently have any connected agents.</span>
            </li>
          )}
          {agents.map((agent) => (
            <li key={agent.id} className="list-group-item d-flex align-items-center">
              <div className="d-flex flex-column me-3">
                <strong>{agent.name}</strong>
                <span>Courses: {agent.courses.join(', ')}</span>
                <span>Allowed to: {agent.permissions.join('; ')}</span>
                <span className="text-muted">
                  Connected at {formatDate(agent.created_at, timezone)}
                </span>
                <span className="text-muted">
                  {agent.last_used_at !== null
                    ? `Last used at ${formatDate(agent.last_used_at, timezone)}`
                    : 'Never used'}
                </span>
                <span className="text-muted">
                  Access ends at {formatDate(agent.expires_at, timezone)}
                </span>
              </div>
              <button
                type="button"
                className="btn btn-outline-danger btn-sm ms-auto"
                onClick={() => setAgentToDisconnect(agent)}
              >
                Disconnect
              </button>
            </li>
          ))}
        </ul>
        <div className="card-footer small">
          A connected agent can do only what you allowed, in the courses you chose, and never more
          than your own role in each course allows. Course data it reads is sent to the AI provider
          it uses.
        </div>
      </div>

      <DisconnectAgentModal
        agent={agentToDisconnect}
        csrfToken={csrfToken}
        onClose={() => setAgentToDisconnect(null)}
      />
    </>
  );
}
