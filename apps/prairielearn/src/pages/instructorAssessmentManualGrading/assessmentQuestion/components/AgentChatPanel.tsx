import { useCallback, useEffect, useRef, useState } from 'react';
import { Button, Form } from 'react-bootstrap';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
}

export interface RubricProposal {
  action: 'add' | 'modify' | 'remove';
  itemDescription: string;
  points: number;
  explanation: string;
}

const DEMO_PROPOSAL: RubricProposal = {
  action: 'add',
  itemDescription: 'Uses valid alternative projection method (dot product approach)',
  points: 3,
  explanation:
    'The student uses the dot product formula to compute the projection instead of the matrix formula. This is a valid alternative approach.',
};

const DEMO_MESSAGES: ChatMessage[] = [
  {
    id: '1',
    role: 'system',
    content: 'Chat started. AI grading agent is ready.',
    timestamp: new Date('2026-03-07T12:00:00'),
  },
  {
    id: '2',
    role: 'assistant',
    content:
      "I've sampled 5 random submissions and analyzed the rubric. Here's what I found:\n\n- Most submissions correctly apply the projection formula\n- Common errors include incorrect intermediate computations and missing final answers\n- The current rubric covers the main grading criteria well",
    timestamp: new Date('2026-03-07T12:00:05'),
  },
  {
    id: '3',
    role: 'user',
    content: 'Start grading all ungraded submissions.',
    timestamp: new Date('2026-03-07T12:01:00'),
  },
  {
    id: '4',
    role: 'assistant',
    content:
      "Starting AI grading on 547 ungraded submissions. I'll notify you if I encounter any ambiguous cases that need rubric clarification.",
    timestamp: new Date('2026-03-07T12:01:02'),
  },
  {
    id: '5',
    role: 'system',
    content: 'Grading paused: rubric change proposed.',
    timestamp: new Date('2026-03-07T12:03:30'),
  },
  {
    id: '6',
    role: 'assistant',
    content:
      "I've encountered several submissions that use an alternative but valid approach to compute the projection. The current rubric doesn't account for this method. I've proposed a new rubric item — you can see it highlighted in the rubric settings above.",
    timestamp: new Date('2026-03-07T12:03:31'),
  },
];

const CHAT_WIDTH = 480;

interface AgentChatPanelProps {
  totalSubmissions: number;
  gradedSubmissions: number;
  activeProposal: RubricProposal | null;
  onAcceptProposal: () => void;
  onRejectProposal: () => void;
}

export function AgentChatPanel({
  totalSubmissions,
  gradedSubmissions,
  activeProposal,
  onAcceptProposal,
  onRejectProposal,
}: AgentChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>(DEMO_MESSAGES);
  const [inputValue, setInputValue] = useState('');
  const [isGrading, setIsGrading] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = useCallback(() => {
    if (!inputValue.trim()) return;

    const newMessage: ChatMessage = {
      id: String(Date.now()),
      role: 'user',
      content: inputValue,
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, newMessage]);
    setInputValue('');
  }, [inputValue]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  return (
    <div
      className="d-flex flex-column bg-light border-start"
      style={{
        position: 'fixed',
        top: 'var(--navbar-height, 3.5rem)',
        right: 0,
        bottom: 0,
        width: CHAT_WIDTH,
        zIndex: 1030,
      }}
    >
      {/* Header */}
      <div className="border-bottom px-3 py-2 d-flex align-items-center justify-content-between bg-light">
        <div className="d-flex align-items-center gap-2">
          <i className="bi bi-stars text-primary" />
          <span className="fw-semibold">AI grading agent</span>
        </div>
        <Button
          variant="outline-secondary"
          size="sm"
          title="End chat"
          onClick={() => setIsGrading(false)}
        >
          <i className="bi bi-x-lg" />
        </Button>
      </div>

      {/* Progress bar */}
      <div className="border-bottom px-3 py-2 bg-light">
        <div className="d-flex justify-content-between align-items-center mb-1">
          <small className="text-muted">
            Graded {gradedSubmissions}/{totalSubmissions} submissions
          </small>
          {isGrading ? (
            <span className="badge bg-success d-flex align-items-center gap-1">
              <span
                className="spinner-grow spinner-grow-sm"
                role="status"
                style={{ width: '0.5rem', height: '0.5rem' }}
              />
              Grading
            </span>
          ) : (
            <span className="badge bg-secondary">Paused</span>
          )}
        </div>
        <div className="progress" style={{ height: 6 }}>
          <div
            className="progress-bar bg-success"
            style={{ width: `${(gradedSubmissions / totalSubmissions) * 100}%` }}
          />
        </div>
      </div>

      {/* Messages */}
      <div className="flex-grow-1 overflow-auto px-3 py-2" style={{ minHeight: 0 }}>
        {messages.map((message) => (
          <div key={message.id} className="mb-3">
            {message.role === 'system' ? (
              <div className="text-center">
                <small className="text-muted fst-italic">{message.content}</small>
              </div>
            ) : (
              <div
                className={`d-flex ${message.role === 'user' ? 'justify-content-end' : 'justify-content-start'}`}
              >
                <div
                  className={`rounded px-3 py-2 ${
                    message.role === 'user' ? 'bg-primary text-white' : 'bg-white border'
                  }`}
                  style={{ maxWidth: '85%' }}
                >
                  <div style={{ whiteSpace: 'pre-wrap', fontSize: '0.875rem' }}>
                    {message.content}
                  </div>
                </div>
              </div>
            )}
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Proposal accept/reject bar */}
      {activeProposal && (
        <div className="border-top bg-white px-3 py-2">
          <div className="d-flex align-items-center gap-1 mb-2">
            <i className="bi bi-pencil-square text-warning" />
            <small className="fw-semibold">Proposed rubric change</small>
            <span className="badge bg-success ms-1" style={{ fontSize: '0.6875rem' }}>
              {activeProposal.action}
            </span>
          </div>
          <div className="mb-2" style={{ fontSize: '0.8125rem' }}>
            <strong>{activeProposal.points} pts</strong> &mdash; {activeProposal.itemDescription}
          </div>
          <div className="d-flex gap-2">
            <Button variant="success" size="sm" className="flex-grow-1" onClick={onAcceptProposal}>
              <i className="bi bi-check-lg me-1" />
              Accept
            </Button>
            <Button
              variant="outline-danger"
              size="sm"
              className="flex-grow-1"
              onClick={onRejectProposal}
            >
              <i className="bi bi-x-lg me-1" />
              Reject
            </Button>
          </div>
        </div>
      )}

      {/* Input */}
      <div className="border-top px-3 py-2 bg-light">
        {!isGrading && (
          <Button
            variant="primary"
            size="sm"
            className="w-100 mb-2"
            onClick={() => setIsGrading(true)}
          >
            <i className="bi bi-stars me-1" />
            Start AI grading
          </Button>
        )}
        <div className="d-flex gap-2">
          <Form.Control
            as="textarea"
            rows={2}
            placeholder="Ask anything..."
            value={inputValue}
            style={{ resize: 'none', fontSize: '0.875rem' }}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          <Button
            variant="primary"
            size="sm"
            className="align-self-end"
            disabled={!inputValue.trim()}
            onClick={handleSend}
          >
            <i className="bi bi-send" />
          </Button>
        </div>
        <div className="mt-1">
          <small className="text-muted">AI can make mistakes. Review grading results.</small>
        </div>
      </div>
    </div>
  );
}

AgentChatPanel.DEMO_PROPOSAL = DEMO_PROPOSAL;
AgentChatPanel.CHAT_WIDTH = CHAT_WIDTH;
