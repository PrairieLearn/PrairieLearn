import { html } from '@prairielearn/html';

import type { AiCluster } from '../../../lib/db-types.js';
import { idsEqual } from '../../../lib/id.js';

export function AIClusterSwitcher({
  aiClusters,
  currentClusterId,
}: {
  aiClusters: AiCluster[];
  currentClusterId: string | null;
}) {
  return html`
    ${aiClusters.map((cluster) => {
      const isSelected = currentClusterId
        ? idsEqual(cluster.id, currentClusterId)
        : cluster.id === '';
      return html`
        <a
          class="dropdown-item ${isSelected ? 'active' : ''}"
          aria-current="${isSelected ? 'page' : ''}"
          value="${cluster.id}"
        >
          ${cluster.cluster_name}
        </a>
      `;
    })}
  `.toString();
}
