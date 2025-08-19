import { html } from '@prairielearn/html';

import type { AiCluster } from '../../../lib/db-types.js';
import { idsEqual } from '../../../lib/id.js';

export function AIClusterSwitcher({
    aiClusters,
    currentClusterId,
    plainUrlPrefix
}: {
    aiClusters: AiCluster[];
    currentClusterId: string | null;
    plainUrlPrefix: string;
}) {
    return html`
        ${aiClusters.map((cluster) => {
            const isSelected = currentClusterId ? idsEqual(cluster.id, currentClusterId) : cluster.id === '';
            return html`
            <a
                class="dropdown-item ${isSelected ? 'active' : ''}"
                aria-current="${isSelected ? 'page' : ''}"
                href="${plainUrlPrefix}/course/${cluster.id}/course_admin"
            >
                ${cluster.cluster_name}
            </a>
            `;
        })}
    `.toString();

}