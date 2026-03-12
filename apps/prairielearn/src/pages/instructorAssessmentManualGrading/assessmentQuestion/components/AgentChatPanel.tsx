import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Button, Form, ProgressBar } from 'react-bootstrap';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  /** Special message type for structured responses with action buttons. */
  special?: 'rubricGenerated' | 'rubricProposal' | 'outdatedWarning';
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

type ChatPhase =
  | 'idle'
  | 'generating'
  | 'rubricReady'
  | 'grading'
  | 'proposalPending'
  | 'complete'
  | 'rerunning';

const TOTAL_GRADING_SUBMISSIONS = 100;
const PROPOSAL_AT = 50;
const GRADING_INTERVAL_MS = 150;

const CHAT_WIDTH = 480;

/** Fake chat tabs for the prototype. */
const CHAT_TABS = [
  { id: 'current', label: 'Q3: Projection' },
  { id: 'tab2', label: 'Q1: Eigenvalues' },
  { id: 'tab3', label: 'Q5: Determinants' },
];

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
  const [activeTab, setActiveTab] = useState('current');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const gradingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  /** Whether the rubric was changed mid-grading (proposal accepted). */
  const rubricChangedRef = useRef(false);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

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

  const finishGrading = useCallback(
    (count: number) => {
      if (rubricChangedRef.current) {
        // Rubric was changed mid-grading — warn about outdated gradings.
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
            content: `All ${count} submissions have been graded!\n\nNote: ${PROPOSAL_AT} submissions were graded before the rubric was updated. These gradings used an outdated rubric and may not reflect the new criteria.`,
            timestamp: new Date(),
            special: 'outdatedWarning',
          },
        ]);
      } else {
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
            content: `All ${count} submissions have been graded!`,
            timestamp: new Date(),
          },
        ]);
      }
    },
    [], // rubricChangedRef is a ref, no dependency needed
  );

  const startGradingProgress = useCallback(() => {
    setGradedCount(0);
    setPhase('grading');
    rubricChangedRef.current = false;
    addMessage('system', 'AI grading started.');

    gradingIntervalRef.current = setInterval(() => {
      setGradedCount((prev) => {
        const next = prev + 1;
        if (next === PROPOSAL_AT) {
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
          setTimeout(() => finishGrading(TOTAL_GRADING_SUBMISSIONS), 0);
          return next;
        }
        return next;
      });
    }, GRADING_INTERVAL_MS);
  }, [addMessage, onNewProposal, finishGrading]);

  const resumeGrading = useCallback(() => {
    setPhase('grading');
    addMessage('system', 'Grading resumed.');

    gradingIntervalRef.current = setInterval(() => {
      setGradedCount((prev) => {
        const next = prev + 1;
        if (next >= TOTAL_GRADING_SUBMISSIONS) {
          if (gradingIntervalRef.current) clearInterval(gradingIntervalRef.current);
          gradingIntervalRef.current = null;
          setTimeout(() => finishGrading(TOTAL_GRADING_SUBMISSIONS), 0);
          return next;
        }
        return next;
      });
    }, GRADING_INTERVAL_MS);
  }, [addMessage, finishGrading]);

  const handleAccept = useCallback(() => {
    rubricChangedRef.current = true;
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

  /** Rerun grading on the outdated submissions. */
  const handleRerunWithProposals = useCallback(() => {
    addMessage('user', 'Rerun grading on outdated submissions (with rubric proposals allowed).');
    setPhase('rerunning');
    setGradedCount(0);
    setTimeout(() => {
      addMessage(
        'assistant',
        `Re-grading ${PROPOSAL_AT} submissions with the updated rubric. Rubric proposals are enabled.`,
      );
    }, 500);

    // Simulate rerun progress.
    let count = 0;
    gradingIntervalRef.current = setInterval(() => {
      count += 1;
      setGradedCount(count);
      if (count >= PROPOSAL_AT) {
        if (gradingIntervalRef.current) clearInterval(gradingIntervalRef.current);
        gradingIntervalRef.current = null;
        setTimeout(() => {
          setPhase('complete');
          rubricChangedRef.current = false;
          setMessages((msgs) => [
            ...msgs,
            {
              id: String(Date.now()) + Math.random(),
              role: 'system',
              content: 'Re-grading complete.',
              timestamp: new Date(),
            },
            {
              id: String(Date.now()) + Math.random(),
              role: 'assistant',
              content: `All ${PROPOSAL_AT} outdated submissions have been re-graded with the updated rubric!`,
              timestamp: new Date(),
            },
          ]);
        }, 0);
      }
    }, GRADING_INTERVAL_MS);
  }, [addMessage]);

  const handleRerunNoProposals = useCallback(() => {
    addMessage('user', 'Rerun grading on outdated submissions (no rubric proposals).');
    setPhase('rerunning');
    setGradedCount(0);
    setTimeout(() => {
      addMessage(
        'assistant',
        `Re-grading ${PROPOSAL_AT} submissions with the updated rubric. No rubric changes will be proposed.`,
      );
    }, 500);

    let count = 0;
    gradingIntervalRef.current = setInterval(() => {
      count += 1;
      setGradedCount(count);
      if (count >= PROPOSAL_AT) {
        if (gradingIntervalRef.current) clearInterval(gradingIntervalRef.current);
        gradingIntervalRef.current = null;
        setTimeout(() => {
          setPhase('complete');
          rubricChangedRef.current = false;
          setMessages((msgs) => [
            ...msgs,
            {
              id: String(Date.now()) + Math.random(),
              role: 'system',
              content: 'Re-grading complete.',
              timestamp: new Date(),
            },
            {
              id: String(Date.now()) + Math.random(),
              role: 'assistant',
              content: `All ${PROPOSAL_AT} outdated submissions have been re-graded with the updated rubric!`,
              timestamp: new Date(),
            },
          ]);
        }, 0);
      }
    }, GRADING_INTERVAL_MS);
  }, [addMessage]);

  const handleLeaveAsIs = useCallback(() => {
    addMessage('user', 'Leave outdated gradings as-is.');
    rubricChangedRef.current = false;
    setTimeout(() => {
      addMessage(
        'assistant',
        'Understood. The existing gradings will remain unchanged. You can manually review them if needed.',
      );
    }, 500);
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

  const handleEditRubric = useCallback(() => {
    const rubricPanel = document.getElementById('rubric-setting');
    if (rubricPanel && !rubricPanel.classList.contains('show')) {
      const toggle = document.querySelector<HTMLElement>('[data-bs-target="#rubric-setting"]');
      toggle?.click();
    }
    setTimeout(() => {
      document.getElementById('rubric-setting')?.scrollIntoView({ behavior: 'smooth' });
    }, 350);
  }, []);

  const isGrading = phase === 'grading' || phase === 'rerunning';
  const showOutdatedActions = phase === 'complete' && rubricChangedRef.current;

  // For rerun progress, max is PROPOSAL_AT not TOTAL_GRADING_SUBMISSIONS.
  const progressMax = phase === 'rerunning' ? PROPOSAL_AT : TOTAL_GRADING_SUBMISSIONS;
  const showProgress = isGrading || phase === 'proposalPending' || phase === 'complete';

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
      {/* Chat tabs */}
      <div className="border-bottom bg-white px-2 pt-2" style={{ flexShrink: 0 }}>
        <ul className="nav nav-tabs" style={{ fontSize: '0.8125rem' }}>
          {CHAT_TABS.map((tab) => (
            <li key={tab.id} className="nav-item">
              <button
                type="button"
                className={`nav-link py-1 px-3 ${activeTab === tab.id ? 'active' : ''}`}
                onClick={() => setActiveTab(tab.id)}
              >
                {tab.label}
              </button>
            </li>
          ))}
          <li className="nav-item">
            <button type="button" className="nav-link py-1 px-2 text-muted" disabled>
              <i className="bi bi-plus-lg" />
            </button>
          </li>
        </ul>
      </div>

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
                </div>
              </div>
            )}
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Bottom area: progress + action buttons + input */}
      <div className="border-top px-3 py-2 bg-light">
        {/* Progress bar */}
        {showProgress && (
          <div className="mb-2">
            <div className="d-flex justify-content-between align-items-center mb-1">
              <small className="text-muted">
                Graded {Math.min(gradedCount, progressMax)}/{progressMax} submissions
                {phase === 'rerunning' && ' (rerun)'}
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
              {phase === 'complete' && <span className="badge bg-primary">Complete</span>}
            </div>
            <ProgressBar
              now={(Math.min(gradedCount, progressMax) / progressMax) * 100}
              variant={phase === 'complete' ? 'primary' : 'success'}
              style={{ height: 6 }}
            />
          </div>
        )}

        {/* Paused alert when proposal is pending */}
        {phase === 'proposalPending' && (
          <Alert variant="warning" className="py-2 px-3 mb-2 d-flex align-items-center gap-2">
            <i className="bi bi-exclamation-triangle-fill" />
            <small className="fw-semibold">
              Action requested: review the proposed rubric change
            </small>
          </Alert>
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

        {/* Rubric ready action buttons */}
        {phase === 'rubricReady' && (
          <div className="d-flex gap-2 mb-2">
            <Button
              variant="outline-primary"
              size="sm"
              className="flex-grow-1"
              onClick={handleEditRubric}
            >
              <i className="bi bi-pencil me-1" />
              Edit rubric
            </Button>
            <Button
              variant="success"
              size="sm"
              className="flex-grow-1"
              onClick={startGradingProgress}
            >
              <i className="bi bi-play-fill me-1" />
              Start grading
            </Button>
          </div>
        )}

        {/* Proposal accept/reject buttons */}
        {phase === 'proposalPending' && activeProposal && (
          <div className="d-flex gap-2 mb-2">
            <Button variant="success" size="sm" className="flex-grow-1" onClick={handleAccept}>
              <i className="bi bi-check-lg me-1" />
              Accept
            </Button>
            <Button
              variant="outline-danger"
              size="sm"
              className="flex-grow-1"
              onClick={handleReject}
            >
              <i className="bi bi-x-lg me-1" />
              Reject
            </Button>
          </div>
        )}

        {/* Outdated grading actions */}
        {showOutdatedActions && (
          <div className="mb-2">
            <small className="text-muted d-block mb-1">
              {PROPOSAL_AT} submissions were graded with an outdated rubric:
            </small>
            <div className="d-flex flex-column gap-1">
              <Button variant="primary" size="sm" onClick={handleRerunWithProposals}>
                <i className="bi bi-arrow-repeat me-1" />
                Rerun with rubric proposals
              </Button>
              <Button variant="outline-primary" size="sm" onClick={handleRerunNoProposals}>
                <i className="bi bi-arrow-repeat me-1" />
                Rerun without proposals
              </Button>
              <Button variant="outline-secondary" size="sm" onClick={handleLeaveAsIs}>
                Leave gradings as-is
              </Button>
            </div>
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
