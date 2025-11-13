import { useMemo } from 'preact/compat';
import { Dropdown } from 'react-bootstrap';

import type { RubricData } from '../../../../lib/manualGrading.types.js';
import type { InstanceQuestionRowWithAIGradingStats } from '../assessmentQuestion.types.js';

interface RubricItemsFilterProps {
  rubricData: RubricData | null;
  instanceQuestionsInfo: InstanceQuestionRowWithAIGradingStats[];
  rubricItemsFilter: string[];
  setRubricItemsFilter: (value: string[] | ((prev: string[]) => string[])) => Promise<unknown>;
}

export function RubricItemsFilter({
  rubricData,
  instanceQuestionsInfo,
  rubricItemsFilter,
  setRubricItemsFilter,
}: RubricItemsFilterProps) {
  // Calculate usage statistics for each rubric item
  const rubricItemUsage = useMemo(() => {
    if (!rubricData) return new Map<string, number>();
    const usage = new Map<string, number>();

    // Initialize all items to 0
    rubricData.rubric_items.forEach((item) => {
      usage.set(item.id, 0);
    });

    // Count how many students selected each item
    instanceQuestionsInfo.forEach((iq) => {
      iq.rubric_grading_item_ids.forEach((itemId) => {
        usage.set(itemId, (usage.get(itemId) || 0) + 1);
      });
    });

    return usage;
  }, [rubricData, instanceQuestionsInfo]);

  // Sort rubric items by their number
  const sortedRubricItems = useMemo(() => {
    if (!rubricData) return [];

    return [...rubricData.rubric_items].sort((a, b) => a.number - b.number);
  }, [rubricData]);

  if (!rubricData || rubricData.rubric_items.length === 0) {
    return null;
  }

  return (
    <Dropdown autoClose="outside">
      <Dropdown.Toggle variant="outline-secondary">
        <i
          class={rubricItemsFilter.length > 0 ? 'bi bi-funnel-fill me-2' : 'bi bi-funnel me-2'}
          aria-hidden="true"
        />
        Filter by rubric items
      </Dropdown.Toggle>
      <Dropdown.Menu align="end" style={{ maxWidth: '400px' }}>
        {sortedRubricItems.map((item) => (
          <Dropdown.Item
            key={item.id}
            as="label"
            style={{ cursor: 'pointer' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div class="d-flex align-items-center">
              <input
                type="checkbox"
                checked={rubricItemsFilter.includes(item.id)}
                class="me-2"
                onChange={(e) => {
                  const checked = (e.target as HTMLInputElement).checked;
                  void setRubricItemsFilter((prev) => {
                    if (checked) {
                      return [...prev, item.id];
                    } else {
                      return prev.filter((v) => v !== item.id);
                    }
                  });
                }}
              />
              <div class="flex-grow-1" style={{ minWidth: 0 }}>
                <div class="text-truncate">{item.description}</div>
                <small class="text-muted">
                  {item.points > 0 ? `+${item.points}` : item.points} pts
                </small>
              </div>
              <span class="badge bg-secondary ms-2">{rubricItemUsage.get(item.id) || 0}</span>
            </div>
          </Dropdown.Item>
        ))}
      </Dropdown.Menu>
    </Dropdown>
  );
}
