#!/usr/bin/env bash
#
# Migrate Font Awesome icons to Bootstrap Icons in:
#   apps/prairielearn/src/pages/
#   apps/prairielearn/src/components/
#
# Usage: ./scripts/migrate-fa-to-bi.sh [--dry-run]
#
# With --dry-run, prints what would be changed without modifying files.
#
set -euo pipefail

DRY_RUN=false
if [[ "${1:-}" == "--dry-run" ]]; then
  DRY_RUN=true
fi

SEARCH_DIRS=(
  "apps/prairielearn/src/pages"
  "apps/prairielearn/src/components"
)

# ─── Helpers ───────────────────────────────────────────────────────────────────

# Run a sed replacement across all target files.
# Usage: do_replace <extended-regex> <replacement>
do_replace() {
  local pattern="$1"
  local replacement="$2"

  for dir in "${SEARCH_DIRS[@]}"; do
    if $DRY_RUN; then
      grep -rn --include='*.ts' --include='*.tsx' -E "$pattern" "$dir" || true
    else
      # macOS sed requires '' after -i; Linux sed does not.
      find "$dir" -type f \( -name '*.ts' -o -name '*.tsx' \) -exec \
        sed -i '' -E "s|${pattern}|${replacement}|g" {} +
    fi
  done
}

if $DRY_RUN; then
  echo "=== DRY RUN — showing matches, not replacing ==="
  echo ""
fi

# ─── Phase 1: Replace simple icon class mappings ──────────────────────────────
#
# Order matters: more specific patterns first, then general ones.
# Each replacement maps "fa(s|r|b) fa-<name>" → "bi bi-<name>".

echo "Phase 1: Direct icon class replacements"

# --- Arrows & Navigation ---
do_replace 'fa[s]? fa-angle-double-left'   'bi bi-chevron-double-left'
do_replace 'fa[s]? fa-angle-double-right'  'bi bi-chevron-double-right'
do_replace 'fa[s]? fa-angle-left'          'bi bi-chevron-left'
do_replace 'fa[s]? fa-angle-right'         'bi bi-chevron-right'
do_replace 'fa[s]? fa-angle-up'            'bi bi-chevron-up'
do_replace 'fas fa-chevron-up'             'bi bi-chevron-up'
do_replace 'fas fa-chevron-down'           'bi bi-chevron-down'
do_replace 'fas fa-arrows-up-down'         'bi bi-arrow-down-up'
do_replace 'fa[s]? fa-arrow-left'          'bi bi-arrow-left'
do_replace 'fa[s]? fa-arrow-right'         'bi bi-arrow-right'
do_replace 'fa[s]? fa-arrow-up'            'bi bi-arrow-up'
do_replace 'fa[s]? fa-arrow-down'          'bi bi-arrow-down'
do_replace 'fa[s]? fa-home'               'bi bi-house-door-fill'

# --- Actions ---
do_replace 'fa[s]? fa-plus'               'bi bi-plus-lg'
do_replace 'fa[s]? fa-times'              'bi bi-x-lg'
do_replace 'fa[s]? fa-edit'               'bi bi-pencil-square'
do_replace 'fas fa-pencil'                'bi bi-pencil'
do_replace 'far fa-trash-alt'             'bi bi-trash'
do_replace 'fa[s]? fa-trash'              'bi bi-trash-fill'
do_replace 'fa[s]? fa-save'               'bi bi-floppy-fill'
do_replace 'fa[s]? fa-clone'              'bi bi-copy'
do_replace 'far fa-copy'                  'bi bi-copy'
do_replace 'fa[s]? fa-copy'               'bi bi-copy'
do_replace 'fa[s]? fa-sync-alt'           'bi bi-arrow-repeat'
do_replace 'fa[s]? fa-sync'               'bi bi-arrow-repeat'
do_replace 'fa[s]? fa-rotate-right'       'bi bi-arrow-repeat'
do_replace 'fa[s]? fa-rotate'             'bi bi-arrow-repeat'
do_replace 'fa[s]? fa-search'             'bi bi-search'
do_replace 'fas fa-download'              'bi bi-download'
do_replace 'fas fa-upload'                'bi bi-upload'
do_replace 'fas fa-share-nodes'           'bi bi-share-fill'
do_replace 'fas fa-shuffle'               'bi bi-shuffle'
do_replace 'fas fa-play'                  'bi bi-play-fill'
do_replace 'fa[s]? fa-wand-magic-sparkles' 'bi bi-stars'
do_replace 'fas fa-paintbrush'            'bi bi-brush-fill'
do_replace 'fas fa-recycle'               'bi bi-recycle'
do_replace 'fa[s]? fa-grip-vertical'      'bi bi-grip-vertical'

# --- Status & Feedback ---
# far (outline) first, then fa/fas (solid → fill)
do_replace 'far fa-question-circle'       'bi bi-question-circle'
do_replace 'fa[s]? fa-check-circle'       'bi bi-check-circle-fill'
do_replace 'fas fa-check-square'          'bi bi-check-square-fill'
do_replace 'fa[s]? fa-check'              'bi bi-check-lg'
do_replace 'fa[s]? fa-exclamation-circle'  'bi bi-exclamation-circle-fill'
do_replace 'fa[s]? fa-exclamation-triangle' 'bi bi-exclamation-triangle-fill'
do_replace 'fas fa-question-circle'       'bi bi-question-circle-fill'
do_replace 'fa[s]? fa-question-circle'    'bi bi-question-circle-fill'
do_replace 'fa[s]? fa-info-circle'        'bi bi-info-circle-fill'
do_replace 'fas fa-circle-info'           'bi bi-info-circle-fill'
do_replace 'fa[s]? fa-lock'               'bi bi-lock-fill'
do_replace 'fas fa-ban'                   'bi bi-slash-circle-fill'
do_replace 'fas fa-clipboard-check'       'bi bi-clipboard-check-fill'


# --- Content & Objects ---
# far (outline) first
do_replace 'far fa-clipboard'             'bi bi-clipboard'
do_replace 'far fa-file-alt'              'bi bi-file-earmark-text'
# fas/fa (solid → fill)
do_replace 'fas fa-qrcode'               'bi bi-qr-code-scan'
do_replace 'fa[s]? fa-folder'             'bi bi-folder-fill'
do_replace 'fas fa-book'                  'bi bi-book-fill'
do_replace 'fas fa-tags'                  'bi bi-tags-fill'
do_replace 'fas fa-tag'                   'bi bi-tag-fill'
do_replace 'fa[s]? fa-list-check'         'bi bi-list-check'
do_replace 'fa[s]? fa-list'               'bi bi-list-ul'
do_replace 'fa[s]? fa-tasks'              'bi bi-list-task'
do_replace 'fa[s]? fa-question'           'bi bi-question-lg'
do_replace 'fas fa-paperclip'             'bi bi-paperclip'

# --- Time ---
do_replace 'far fa-clock'                 'bi bi-clock'
do_replace 'fa[s]? fa-clock'              'bi bi-clock-fill'
do_replace 'fa[s]? fa-hourglass-half'     'bi bi-hourglass-split'

# --- UI & Interface ---
do_replace 'fas fa-window-restore'        'bi bi-window-stack'
do_replace 'fas fa-bars-staggered'        'bi bi-journal-text'
do_replace 'fa[s]? fa-i-cursor'           'bi bi-cursor-text'
do_replace 'fa[s]? fa-laptop-code'        'bi bi-laptop'
do_replace 'far fa-caret-square-down'     'bi bi-caret-down-square'
do_replace 'fas fa-eye-slash'             'bi bi-eye-slash-fill'
do_replace 'fas fa-cog'                   'bi bi-gear-fill'


echo ""
echo "Phase 2: Special cases"

# workspace failed state: fa fa-10x fa-xmark → bi bi-x with large font-size
# class="d-block fa fa-10x fa-xmark text-danger"
do_replace 'd-block fa fa-10x fa-xmark'   'd-block bi bi-x" style="font-size: 10rem'

# workspaceLogs: dynamic class with fa-calendar / fa-ban and fa-2xl
# The pattern is: class="fa ${...? 'fa-calendar' : 'fa-ban'} fa-2xl"
# We need to replace this carefully. It's a template literal.
if ! $DRY_RUN; then
  for dir in "${SEARCH_DIRS[@]}"; do
    find "$dir" -type f \( -name '*.ts' -o -name '*.tsx' \) -exec \
      sed -i '' "s|'fa-calendar'|'bi-calendar-fill'|g" {} +
    find "$dir" -type f \( -name '*.ts' -o -name '*.tsx' \) -exec \
      sed -i '' "s|'fa-ban'|'bi-slash-circle-fill'|g" {} +
    find "$dir" -type f \( -name '*.ts' -o -name '*.tsx' \) -exec \
      sed -i '' -E "s|class=\"fa (\\\$\{[^}]+\}) fa-2xl\"|class=\"bi \1\" style=\"font-size: 1.5em\"|g" {} +
  done
else
  for dir in "${SEARCH_DIRS[@]}"; do
    grep -rn --include='*.ts' --include='*.tsx' "fa-calendar\|fa-ban\|fa-2xl" "$dir" || true
  done
fi

# fa-width-auto: just remove it (not needed for Bootstrap Icons)
if ! $DRY_RUN; then
  for dir in "${SEARCH_DIRS[@]}"; do
    find "$dir" -type f \( -name '*.ts' -o -name '*.tsx' \) -exec \
      sed -i '' 's| fa-width-auto||g' {} +
  done
else
  for dir in "${SEARCH_DIRS[@]}"; do
    grep -rn --include='*.ts' --include='*.tsx' 'fa-width-auto' "$dir" || true
  done
fi

echo ""
echo "Phase 4: fa-ul / fa-li list pattern → standard list with flex"

# Replace fa-ul class on <ul> elements
if ! $DRY_RUN; then
  for dir in "${SEARCH_DIRS[@]}"; do
    # fa-ul → list-unstyled (Bootstrap utility to remove list styling)
    find "$dir" -type f \( -name '*.ts' -o -name '*.tsx' \) -exec \
      sed -i '' 's|class="fa-ul"|class="list-unstyled"|g' {} +
    # Remove <span class="fa-li"> wrapper, keep the icon inside
    # Pattern: <span class="fa-li"><i ...></i></span> → <i ... style="margin-right: 0.5rem"></i>
    # This is tricky with sed; we'll do a simpler approach:
    # Remove the fa-li span open/close tags
    find "$dir" -type f \( -name '*.ts' -o -name '*.tsx' \) -exec \
      sed -i '' 's|<span class="fa-li">||g' {} +
    find "$dir" -type f \( -name '*.ts' -o -name '*.tsx' \) -exec \
      sed -i '' 's|</span>$||g' {} +
  done
else
  for dir in "${SEARCH_DIRS[@]}"; do
    grep -rn --include='*.ts' --include='*.tsx' 'fa-ul\|fa-li' "$dir" || true
  done
fi

echo ""
echo "Phase 5: Cleanup — remove any remaining bare 'fa ' or 'fas ' or 'far ' prefixes"
echo "  (These should already be replaced, this catches any stragglers)"

# At this point all "fa fa-X" patterns should have been replaced with "bi bi-X".
# But if any remain (e.g., icons we missed), flag them.
echo ""
echo "=== Remaining FA references (should be empty): ==="
for dir in "${SEARCH_DIRS[@]}"; do
  grep -rn --include='*.ts' --include='*.tsx' -E '\bfa[srlbd]? fa-[a-z]' "$dir" || true
  grep -rn --include='*.ts' --include='*.tsx' -E '"fa ' "$dir" || true
done

echo ""
if $DRY_RUN; then
  echo "Done (dry run). No files were modified."
else
  echo "Done! Icon migration complete."
  echo ""
  echo "IMPORTANT: You still need to:"
  echo "  1. Add a CSS rule for .spin-animation if you don't have one already:"
  echo "     .spin-animation { animation: spin 1s linear infinite; }"
  echo "     @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }"
  echo "  2. Verify the fa-ul/fa-li list replacements in workspace.html.ts look correct"
  echo "  3. Verify the workspaceLogs dynamic class replacement"
  echo "  4. Run: make format-changed"
  echo "  5. Visually spot-check the pages"
fi
