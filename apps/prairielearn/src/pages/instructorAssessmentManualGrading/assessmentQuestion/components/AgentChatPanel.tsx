import { useCallback, useEffect, useRef, useState } from 'react';
import { Button, Form, ProgressBar } from 'react-bootstrap';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  /** Special message type for structured responses with action buttons. */
  special?: 'rubricGenerated' | 'rubricProposal';
}

export interface RubricProposal {
  action: 'add' | 'modify' | 'remove';
  itemDescription: string;
  points: number;
  explanation: string;
  graderNote: string;
}

const RUBRIC_PROPOSAL: RubricProposal = {
  action: 'add',
  itemDescription: 'Uses valid alternative projection method (dot product approach)',
  points: 3,
  explanation:
    'The student uses the dot product formula to compute the projection instead of the matrix formula. This is a valid alternative approach.',
  graderNote:
    'Encountered in 12 submissions so far. Students who use this method tend to arrive at the correct answer.',
};

type ChatPhase = 'idle' | 'generating' | 'rubricReady' | 'grading' | 'proposalPending' | 'complete';

const TOTAL_GRADING_SUBMISSIONS = 100;
const PROPOSAL_AT = 50;
const GRADING_INTERVAL_MS = 150;

const CHAT_WIDTH = 480;

interface AgentChatPanelProps {
  activeProposal: RubricProposal | null;
  onAcceptProposal: () => void;
  onRejectProposal: () => void;
  onSuggestChanges: (text: string) => void;
  onNewProposal: (proposal: RubricProposal) => void;
}

export function AgentChatPanel({
  activeProposal,
  onAcceptProposal,
  onRejectProposal,
  onSuggestChanges,
  onNewProposal,
}: AgentChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [phase, setPhase] = useState<ChatPhase>('idle');
  const [gradedCount, setGradedCount] = useState(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const gradingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Cleanup grading interval on unmount.
  useEffect(() => {
    return () => {
      if (gradingIntervalRef.current) clearInterval(gradingIntervalRef.current);
    };
  }, []);

  const addMessage = useCallback(
    (role: ChatMessage['role'], content: string, special?: ChatMessage['special']) => {
      setMessages((prev) => [
        ...prev,
        { id: String(Date.now()) + Math.random(), role, content, timestamp: new Date(), special },
      ]);
    },
    [],
  );

  const startGradingProgress = useCallback(() => {
    setGradedCount(0);
    setPhase('grading');
    addMessage('system', 'AI grading started.');

    gradingIntervalRef.current = setInterval(() => {
      setGradedCount((prev) => {
        const next = prev + 1;
        if (next === PROPOSAL_AT) {
          // Pause grading and propose a rubric change.
          if (gradingIntervalRef.current) clearInterval(gradingIntervalRef.current);
          gradingIntervalRef.current = null;

          setTimeout(() => {
            setPhase('proposalPending');
            onNewProposal(RUBRIC_PROPOSAL);
            setMessages((msgs) => [
              ...msgs,
              {
                id: String(Date.now()) + Math.random(),
                role: 'system',
                content: 'Grading paused: rubric change proposed.',
                timestamp: new Date(),
              },
              {
                id: String(Date.now()) + Math.random(),
                role: 'assistant',
                content:
                  "I've encountered several submissions that use an alternative but valid approach to compute the projection. The current rubric doesn't account for this method.\n\nI've proposed a new rubric item — you can see it highlighted in the rubric settings above. You can accept, reject, or suggest changes.",
                timestamp: new Date(),
                special: 'rubricProposal',
              },
            ]);
          }, 0);
          return next;
        }
        if (next >= TOTAL_GRADING_SUBMISSIONS) {
          if (gradingIntervalRef.current) clearInterval(gradingIntervalRef.current);
          gradingIntervalRef.current = null;

          setTimeout(() => {
            setPhase('complete');
            setMessages((msgs) => [
              ...msgs,
              {
                id: String(Date.now()) + Math.random(),
                role: 'system',
                content: 'Grading complete.',
                timestamp: new Date(),
              },
              {
                id: String(Date.now()) + Math.random(),
                role: 'assistant',
                content: `All ${TOTAL_GRADING_SUBMISSIONS} submissions have been graded! You can review the results in the table above. Let me know if you'd like to adjust anything.`,
                timestamp: new Date(),
              },
            ]);
          }, 0);
          return next;
        }
        return next;
      });
    }, GRADING_INTERVAL_MS);
  }, [addMessage, onNewProposal]);

  const resumeGrading = useCallback(() => {
    setPhase('grading');
    addMessage('system', 'Grading resumed.');

    gradingIntervalRef.current = setInterval(() => {
      setGradedCount((prev) => {
        const next = prev + 1;
        if (next >= TOTAL_GRADING_SUBMISSIONS) {
          if (gradingIntervalRef.current) clearInterval(gradingIntervalRef.current);
          gradingIntervalRef.current = null;

          setTimeout(() => {
            setPhase('complete');
            setMessages((msgs) => [
              ...msgs,
              {
                id: String(Date.now()) + Math.random(),
                role: 'system',
                content: 'Grading complete.',
                timestamp: new Date(),
              },
              {
                id: String(Date.now()) + Math.random(),
                role: 'assistant',
                content: `All ${TOTAL_GRADING_SUBMISSIONS} submissions have been graded! You can review the results in the table above. Let me know if you'd like to adjust anything.`,
                timestamp: new Date(),
              },
            ]);
          }, 0);
          return next;
        }
        return next;
      });
    }, GRADING_INTERVAL_MS);
  }, [addMessage]);

  const handleAccept = useCallback(() => {
    onAcceptProposal();
    addMessage('user', 'Accept the proposed rubric change.');
    setTimeout(() => {
      addMessage('assistant', 'Rubric updated. Resuming grading with the new rubric item applied.');
      resumeGrading();
    }, 500);
  }, [onAcceptProposal, addMessage, resumeGrading]);

  const handleReject = useCallback(() => {
    onRejectProposal();
    addMessage('user', 'Reject the proposed rubric change.');
    setTimeout(() => {
      addMessage('assistant', 'Understood. Continuing grading without the proposed change.');
      resumeGrading();
    }, 500);
  }, [onRejectProposal, addMessage, resumeGrading]);

  const handleGenerateRubric = useCallback(() => {
    setPhase('generating');
    addMessage('assistant', 'Generating rubric...');

    setTimeout(() => {
      setPhase('rubricReady');
      setMessages((prev) => [
        ...prev,
        {
          id: String(Date.now()) + Math.random(),
          role: 'assistant',
          content:
            "Rubric generated! I've analyzed the question and created a rubric with scoring criteria. You can review and edit it in the rubric settings above.",
          timestamp: new Date(),
          special: 'rubricGenerated',
        },
      ]);
    }, 5000);
  }, [addMessage]);

  const handleSend = useCallback(() => {
    if (!inputValue.trim()) return;

    const text = inputValue.trim();
    addMessage('user', text);
    setInputValue('');

    if (phase === 'proposalPending') {
      onSuggestChanges(text);
      setTimeout(() => {
        addMessage(
          'assistant',
          "[PLACEHOLDER] I've noted your feedback on the rubric change. Let me know if you'd like to accept, reject, or further refine the proposal.",
        );
      }, 1000);
    } else {
      setTimeout(() => {
        addMessage(
          'assistant',
          "[PLACEHOLDER] Thanks for your message. Let me know how you'd like to proceed.",
        );
      }, 1000);
    }
  }, [inputValue, addMessage, phase, onSuggestChanges]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  const isGrading = phase === 'grading';

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
      {/* Messages */}
      <div className="flex-grow-1 overflow-auto px-3 py-2" style={{ minHeight: 0 }}>
        {messages.length === 0 && (
          <div className="text-center text-muted mt-4">
            <i className="bi bi-stars d-block mb-2" style={{ fontSize: '2rem' }} />
            <p>AI grading agent is ready.</p>
            <p className="small">Generate a rubric to get started, or ask anything below.</p>
          </div>
        )}
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
                  {message.special === 'rubricGenerated' && phase === 'rubricReady' && (
                    <div className="mt-2 d-flex flex-wrap gap-2">
                      <Button variant="outline-primary" size="sm">
                        <i className="bi bi-pencil me-1" />
                        Edit rubric
                      </Button>
                      <Button variant="success" size="sm" onClick={startGradingProgress}>
                        <i className="bi bi-play-fill me-1" />
                        Start grading
                      </Button>
                    </div>
                  )}
                  {message.special === 'rubricProposal' &&
                    phase === 'proposalPending' &&
                    activeProposal && (
                      <div className="mt-2 d-flex flex-wrap gap-2">
                        <Button variant="success" size="sm" onClick={handleAccept}>
                          <i className="bi bi-check-lg me-1" />
                          Accept
                        </Button>
                        <Button variant="outline-danger" size="sm" onClick={handleReject}>
                          <i className="bi bi-x-lg me-1" />
                          Reject
                        </Button>
                      </div>
                    )}
                </div>
              </div>
            )}
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Bottom area: progress + input */}
      <div className="border-top px-3 py-2 bg-light">
        {/* Progress bar — shown during grading */}
        {(isGrading || phase === 'proposalPending' || phase === 'complete') && (
          <div className="mb-2">
            <div className="d-flex justify-content-between align-items-center mb-1">
              <small className="text-muted">
                Graded {gradedCount}/{TOTAL_GRADING_SUBMISSIONS} submissions
              </small>
              {isGrading && (
                <span className="badge bg-success d-flex align-items-center gap-1">
                  <span
                    className="spinner-grow spinner-grow-sm"
                    role="status"
                    style={{ width: '0.5rem', height: '0.5rem' }}
                  />
                  Grading
                </span>
              )}
              {phase === 'proposalPending' && (
                <span className="badge bg-warning text-dark">Paused</span>
              )}
              {phase === 'complete' && <span className="badge bg-primary">Complete</span>}
            </div>
            <ProgressBar
              now={(gradedCount / TOTAL_GRADING_SUBMISSIONS) * 100}
              variant={phase === 'complete' ? 'primary' : 'success'}
              style={{ height: 6 }}
            />
          </div>
        )}

        {/* Generate rubric button */}
        {phase === 'idle' && (
          <Button
            variant="outline-primary"
            size="sm"
            className="w-100 mb-2"
            onClick={handleGenerateRubric}
          >
            <i className="bi bi-stars me-1" />
            Generate new rubric
          </Button>
        )}

        {/* Generating indicator */}
        {phase === 'generating' && (
          <div className="text-center mb-2">
            <span className="spinner-border spinner-border-sm text-primary me-2" role="status" />
            <small className="text-muted">Generating rubric...</small>
          </div>
        )}

        {/* Input field */}
        <div className="d-flex gap-2">
          <Form.Control
            as="textarea"
            rows={2}
            placeholder={
              phase === 'proposalPending' ? 'Suggest changes to the proposal...' : 'Ask anything...'
            }
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

AgentChatPanel.CHAT_WIDTH = CHAT_WIDTH;
