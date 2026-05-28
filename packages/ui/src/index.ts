// Augment @tanstack/react-table types
import './react-table.js';

export {
  TanstackTable,
  TanstackTableCard,
  TanstackTableEmptyState,
} from './components/TanstackTable.js';
export { ColumnManager } from './components/ColumnManager.js';
export {
  TanstackTableDownloadButton,
  type TanstackTableCsvCell,
} from './components/TanstackTableDownloadButton.js';
export {
  MultiSelectColumnFilter,
  applyMultiSelectFilter,
  type MultiSelectFilterMode,
  type MultiSelectFilterValue,
} from './components/MultiSelectColumnFilter.js';
export {
  NumericInputColumnFilter,
  parseNumericFilter,
  numericColumnFilterFn,
  type NumericColumnFilterValue,
} from './components/NumericInputColumnFilter.js';
export { useShiftClickCheckbox } from './components/useShiftClickCheckbox.js';
export { useAutoSizeColumns } from './components/useAutoSizeColumns.js';
export { OverlayTrigger, type OverlayTriggerProps } from './components/OverlayTrigger.js';
export { PresetFilterDropdown } from './components/PresetFilterDropdown.js';
export {
  NuqsAdapter,
  parseAsSortingState,
  parseAsColumnVisibilityStateWithColumns,
  parseAsColumnPinningState,
  parseAsNumericFilter,
  parseAsMultiSelectFilter,
} from './components/nuqs.js';
export { useColumnVisibilityQueryState } from './hooks/use-column-visibility-query-state.js';
export { useColumnFilters, type ColumnFilterEntry } from './hooks/use-column-filters.js';

export { SplitPane, type SplitPaneProps } from './components/SplitPane.js';
export {
  StickySaveBar,
  type StickySaveBarAlert,
  type StickySaveBarProps,
} from './components/StickySaveBar.js';

export { extractLeafColumnIds } from './components/tanstack-table-utils.js';

export { useModalState } from './hooks/use-modal-state.js';
export { useResizeHandle } from './hooks/use-resize-handle.js';
export {
  ComboBox,
  TagPicker,
  type ComboBoxItem,
  type ComboBoxProps,
  type TagPickerProps,
} from './components/ComboBox.js';
export {
  FilterDropdown,
  type FilterItem,
  type FilterDropdownProps,
} from './components/FilterDropdown.js';
export {
  ExpandableCheckboxGroup,
  type ExpandableCheckboxGroupProps,
} from './components/ExpandableCheckboxGroup.js';
export {
  IndeterminateCheckbox,
  type IndeterminateCheckboxProps,
} from './components/IndeterminateCheckbox.js';
export {
  RadioGroup,
  Radio,
  type RadioGroupProps,
  type RadioProps,
} from './components/RadioGroup.js';
export { RichSelect, type RichSelectItem, type RichSelectProps } from './components/RichSelect.js';
