import { onDocumentReady } from '@prairielearn/browser-utils';
import { installBootstrapTooltipBehavior } from '@prairielearn/ui/bootstrap-tooltip';

import './behaviors/autosize-textareas.js';
import './behaviors/dropdown.js';
import './behaviors/popover.js';
import './behaviors/collapsible-card.js';
import './behaviors/clipboard-popover.js';
import './behaviors/number-input-wheel.js';

onDocumentReady(() => {
  installBootstrapTooltipBehavior({ Tooltip: window.bootstrap.Tooltip });
});
