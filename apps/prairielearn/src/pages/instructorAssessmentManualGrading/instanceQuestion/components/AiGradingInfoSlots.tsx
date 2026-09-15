import { useEffect, useState } from 'react';

import type { InstanceQuestionAIGradingInfo } from '../../../../ee/lib/ai-grading/types.js';
import { mathjaxTypeset } from '../../../../lib/client/mathjax.js';
import { GRADING_PANEL_REFRESH_EVENT } from '../instanceQuestion.shared.js';

import type { GradingPanelRefreshDetail } from './gradingPanel.types.js';

export function AiGradingInfoSlots({
  initialAiGradingInfo,
}: {
  initialAiGradingInfo?: InstanceQuestionAIGradingInfo;
}) {
  const [aiGradingInfo, setAiGradingInfo] = useState(initialAiGradingInfo);

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<GradingPanelRefreshDetail>).detail;
      setAiGradingInfo(detail.aiGradingInfo);
    };
    document.addEventListener(GRADING_PANEL_REFRESH_EVENT, handler);
    return () => document.removeEventListener(GRADING_PANEL_REFRESH_EVENT, handler);
  }, []);

  useEffect(() => {
    if (!aiGradingInfo?.explanation) return;
    void mathjaxTypeset();
  }, [aiGradingInfo]);

  if (!aiGradingInfo) return null;

  const rotationCorrectionApplied =
    aiGradingInfo.hasImage && Object.keys(aiGradingInfo.rotationCorrectionDegrees).length > 0;

  return (
    <>
      <div
        id="ai-grading-explanation"
        className="card mb-3 grading-block"
        style={{ scrollMarginTop: 10 }}
      >
        <div className="card-header collapsible-card-header bg-secondary text-white d-flex align-items-center">
          <h2>AI grading explanation</h2>
          <button
            type="button"
            className="expand-icon-container btn btn-outline-light btn-sm text-nowrap ms-auto"
            data-bs-toggle="collapse"
            data-bs-target="#ai-grading-explanation-body"
            aria-expanded="true"
            aria-controls="ai-grading-explanation-body"
          >
            <i className="fa fa-angle-up ms-1 expand-icon" />
          </button>
        </div>
        <div
          className="js-submission-body js-collapsible-card-body show"
          id="ai-grading-explanation-body"
        >
          <div className="card-body">
            {rotationCorrectionApplied ? (
              <div className="alert alert-warning mb-3" role="alert">
                <p>
                  One or more images were uploaded in a rotated state by the student (this was an
                  error by the student). The system corrected their rotation prior to AI grading.
                </p>
                <div className="card table-responsive mb-0" style={{ maxWidth: 800 }}>
                  <table className="table table-sm mb-0">
                    <thead className="table-light">
                      <tr>
                        <th className="text-nowrap">Filename</th>
                        <th className="text-nowrap">Correction (counterclockwise)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(aiGradingInfo.rotationCorrectionDegrees).map(
                        ([filename, degrees]) => (
                          <tr key={filename}>
                            <td className="text-nowrap">
                              <code>{filename}</code>
                            </td>
                            <td>{degrees}&deg;</td>
                          </tr>
                        ),
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : null}
            {aiGradingInfo.explanation ? (
              <pre
                className="mb-0 overflow-visible mathjax_process"
                style={{ whiteSpace: 'pre-wrap' }}
              >
                {aiGradingInfo.explanation}
              </pre>
            ) : null}
          </div>
        </div>
      </div>
      {aiGradingInfo.prompt ? (
        <div className="card mb-3 grading-block">
          <div className="card-header collapsible-card-header bg-secondary text-white d-flex align-items-center">
            <h2>AI grading prompt</h2>
            <button
              type="button"
              className="expand-icon-container btn btn-outline-light btn-sm text-nowrap ms-auto collapsed"
              data-bs-toggle="collapse"
              data-bs-target="#ai-grading-prompt-body"
              aria-expanded="false"
              aria-controls="ai-grading-prompt-body"
            >
              <i className="fa fa-angle-up ms-1 expand-icon" />
            </button>
          </div>
          <div
            className="card-body collapse js-submission-body js-collapsible-card-body"
            id="ai-grading-prompt-body"
          >
            <h5 className="card-title">Raw prompt</h5>
            <pre className="mb-0">
              <code>{aiGradingInfo.prompt}</code>
            </pre>
          </div>
        </div>
      ) : null}
    </>
  );
}

AiGradingInfoSlots.displayName = 'AiGradingInfoSlots';
