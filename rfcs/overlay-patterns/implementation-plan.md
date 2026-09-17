# Overlay patterns implementation plan

Status: proposed sequence for the [overlay interaction patterns RFC](./design.md).

## Starting assumptions

- Close the old tooltip and contextual-popover PRs. Keep their branches as references, but do not use their generic `Popover`, broad migrations, or universal dialog behavior as a base.
- Start replacement work from current `master`. Reimplement only the old pieces that still fit the RFC.
- Land the vanilla tooltip foundation before the React foundation. Run contextual-help and editor prototypes independently rather than building one large stack.

## How to ship safely

Each production PR should:

1. Leave the application deployable without a later PR.
2. Prove one interaction contract with one or two real consumers; migrate other callsites separately.
3. Test browser behavior with real Bootstrap or React Aria. Do not mock timers, geometry, focus, or event propagation just to test controller plumbing.
4. Expand usage only after the initial callsites pass automated, manual, and assistive-technology checks.

For each new pattern:

1. Record the behavior on `master`.
2. Implement the smallest useful contract.
3. Exercise it in a real-browser fixture and one application page.
4. Test the relevant input modes, zoom, motion setting, and screen-reader output.
5. Migrate one representative callsite and review it before expanding.
6. After each migration batch, recount and reclassify the remaining legacy callsites.

## Proposed sequence

| Phase | Deliverable                                                 | Relationship                                              | Before expanding                                                              |
| ----- | ----------------------------------------------------------- | --------------------------------------------------------- | ----------------------------------------------------------------------------- |
| 0     | Retire the current PRs and establish clean baselines        | Administrative; no code dependency                        | Replacement plan and salvage inventory agreed                                 |
| 1     | Small independently justified correctness fixes             | Separate PRs from `master`; not part of a long stack      | Each bug reproduces on `master` and has focused coverage                      |
| 2     | Permanent vanilla Bootstrap tooltip foundation              | First foundation PR                                       | Real-browser contract passes in PL and against a locally packed package in PT |
| 3     | React `Tooltip` and `IconButton` foundation                 | Begin after phase 2 merges                                | One description and one visual-label consumer pass manual and AT checks       |
| 4     | Tooltip migrations by semantic family                       | Small independent PRs                                     | Prior batch is reviewed and remaining inventory is reclassified               |
| 5     | Contextual-help prototype validation                        | Disposable branch, parallel with phases 2–4               | The selected model passes representative physical-device and AT checks        |
| 6     | Shared contextual-help implementation, if justified         | New foundation PR after phase 5                           | React and vanilla callsites satisfy the same contract                         |
| 7     | PrairieTest anchored-editor prototype                       | Disposable PT branch after phase 2 integration stabilizes | Simple edit, Flatpickr, and HTMX replacement cases all pass                   |
| 8     | Extract shared dialog behavior and migrate typed PT editors | PL package PR and release, then PT PR                     | Typed editor family passes; every custom editor is separately classified      |
| 9     | Longer-term visible-help/disclosure cleanup                 | Independent product-facing PRs                            | Each page is reviewed as a workflow, not as a tooltip count                   |

## Phase 0: replace rather than restack

Classify non-callsite work from the old branches into three groups:

- **Reimplement:** still required, but rewrite from `master` under the new contract.
- **Extract:** an independent bug fix that reproduces on `master`.
- **Discard:** tied to a rejected abstraction or broad migration.

Initial inventory from the current branches:

| Existing work                                                                                                      | Outcome                                                                      | Destination                     |
| ------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------- | ------------------------------- |
| Vanilla hover retention, modality, transitions, ownership, teardown, and Bootstrap issue references                | Reimplement after review                                                     | Phase 2                         |
| React Aria positioning, Bootstrap class mapping, transition styling, and hover-retention experiments               | Reimplement after review                                                     | Phase 3                         |
| Moving PL's application bootstrap to a consumer-supplied `@prairielearn/ui` installer                              | Reimplement with the settled signal and host integration                     | Phase 2                         |
| `QuestionNavigation` rich-content transport change                                                                 | Reproduce and extract only if current output is wrong                        | Independent phase 1 PR          |
| Clipboard live announcement and visual “Copied” state                                                              | Reproduce and extract as status behavior                                     | Independent phase 1 PR          |
| Legacy popover-inside-modal Escape correction                                                                      | Reproduce in a real browser, then extract narrowly                           | Independent phase 1 PR          |
| `FriendlyDate` semantic `<time>` plus optional exact native `title`                                                | Revalidate exact-date importance across consumers, then extract              | Independent product PR          |
| Bootstrap 6-compatible `.btn-icon` backport                                                                        | Retain only if the surviving `IconButton` or contextual-help trigger uses it | Phase 3 or phase 6              |
| Generic public React `Popover`, `HelpPopover`, public docs, and changeset                                          | Discard                                                                      | None                            |
| Universal vanilla popover dialog conversion and empty-focus-trap change                                            | Discard; replace only if the PT editor prototype proves a narrower contract  | Phase 7–8                       |
| Broad callsite conversions, pressable unavailable actions, repeated help buttons, and status-to-button conversions | Discard and later reclassify from `master`                                   | Phase 4 or phase 9              |
| `OverlayTrigger` tooltip deprecation and migration-wide lint failures                                              | Discard until valid legacy consumers reach zero                              | Possible late migration cleanup |
| Fixes for regressions introduced only by the old branches                                                          | Discard                                                                      | None                            |

Keep the old branches until all retained work has landed. Reference specific commits when reusing subtle Bootstrap lifecycle behavior.

## Phase 1: independent correctness fixes

These fixes are independent of the tooltip foundation:

### Rich HTML transport

- Inventory surviving HTML popovers by trust source and transport boundary: `HtmlSafeString`, JSX, Mustache/Python, jQuery or programmatic strings, DOM nodes, and course or third-party content.
- Reproduce the exact `HtmlSafeString`-inside-attribute behavior on `master` with plain text, markup, quotes, ampersands, and untrusted text.
- Define which layer escapes content and which serializes the attribute. Test rendered DOM, not private tagged-template calls.
- Make the smallest correction only if the current output is wrong. Do not globally change Bootstrap HTML popover serialization based on one callsite.

### Copy completion

- Treat “Copied” as action status rather than a tooltip description.
- Use one pre-existing or pre-mounted polite status source per completion and retain useful visible feedback.
- Test repeated copying and two different controls at a normal pace; browsers may coalesce artificial rapid-fire announcements.

### Legacy nested-overlay Escape behavior

- Add a real-browser reproducer for an interactive popover inside a Bootstrap modal.
- If one Escape closes both, fix that event and focus restoration without adding a general overlay manager.

### Friendly dates

- Inventory `FriendlyDate` consumers and separate audit-sensitive timestamps from ordinary relative display.
- Render semantic `<time datetime="…">` in both cases.
- Use native `title` with the exact value only when that precision is genuinely optional and losing it on touch is acceptable. Provide a visible or press-accessible exact value for audit-sensitive uses.
- Remove the component's overlay option if the inventory confirms no surviving consumer needs a press-accessible exact value.

Use separate small PRs. Drop any issue that no longer reproduces on `master`.

## Phase 2: permanent vanilla tooltip foundation

This is the first foundation PR. It provides one vanilla tooltip path for PrairieLearn, PrairieTest, elements, and course content.

### Compatibility prototype

Settle the behavior before writing public documentation. Prototype three cases:

1. A declarative dynamically inserted tooltip.
2. A PrairieLearn programmatic tooltip with a changing label, such as the side-navigation toggle.
3. A direct-constructor fixture and a dynamically rendered PrairieTest tooltip tested against the packed package.

The package integration should have these properties:

- `installBootstrapTooltipBehavior` receives the host `document`, Bootstrap `Tooltip` constructor, and an `AbortSignal`; it does not bundle Bootstrap. Use the signal as the documented cancellation API.
- Installation is idempotent per document. Aborting removes every owned document listener, observer, controller, and generated instance without disposing an externally owned replacement.
- Direct `new bootstrap.Tooltip(...)` calls receive compatible behavior through public lifecycle events and `getInstance`, including instances created after installation.
- Ordinary declarative Bootstrap markup is the documented authoring surface. The adapter infers label treatment for an icon-only control whose tooltip matches its accessible name and description treatment for a visibly named control with distinct tooltip text. Ambiguous legacy markup remains operational through the compatibility baseline.
- Do not expose a browser-global factory or require `data-pl-tooltip-mode`. Add a narrow internal override only if a first-party case cannot use ordinary Bootstrap markup.

Do not expose roles, focus policies, or raw overlay hooks through this API.

### Behavior

- Retain Bootstrap appearance and transitions.
- Start with a 500 ms hover delay, immediate keyboard opening, and a 500 ms close delay.
- Keep the tooltip open over the trigger, through a physically traversable trigger-to-tooltip path, and while the tooltip itself is hovered. A timer alone is insufficient.
- Track input modality so touch-generated focus and compatibility mouse events do not open it and do not consume the control's first tap.
- Close on Escape without moving focus or closing an enclosing modal/popover on the same key event.
- Recover correctly if renewed hover/focus requests opening during the Bootstrap exit transition.
- Support dynamic insertion and removal, name changes, mixed Bootstrap actions, external instance replacement, and abort/reinstall.
- When label treatment is unambiguous, use the trigger's continuously present accessible name as the single caller-authored string. Render it visually, hide the duplicate bubble from the accessibility tree, and remove Bootstrap's redundant description.
- When description treatment is unambiguous, keep the independently named control and retain one nonredundant `aria-describedby` relationship while open.

### Initial callsites

Choose one existing label tooltip and one existing description tooltip on ordinary PL pages. Prefer a dynamic label such as the side-navigation toggle. Do not convert a popover merely to create a test case.

### Automated checks

Add a small Playwright spec using the real application bundle, Bootstrap, production installer, and browser event system. Cover:

1. Inferred label versus description accessibility relationships, including a dynamic label update.
2. Real pointer movement from trigger to tooltip, Escape dismissal, and no touch-triggered opening or lost primary activation.
3. Dynamic insertion and removal, programmatic creation, abort/reinstall, and external instance replacement without stale ownership.

Do not repeat this with mocked Vitest DOM tests. Keep visual collision, screen-reader speech, and large-pointer transit as manual checks.

### Manual checks

- Chrome and Firefox keyboard/mouse checks on the proof callsites.
- Safari/VoiceOver confirms label mode is announced once and description mode supplies one nonredundant description.
- Sighted iOS Safari and Android Chrome confirm no tooltip opens and the action remains one-tap operable.
- Slow pointer transit with ordinary and large pointer settings at 100%, 200%, and 400% zoom.
- Reduced-motion behavior and interrupted exit transition.
- Smoke-test a packed package in PrairieTest; do not commit a filesystem dependency.
- Build, targeted typecheck/lint/format, the Playwright spec, and normal CI pass.

The PR includes a changeset and documents the host installer and ordinary Bootstrap authoring. It does not add a browser API, React components, contextual help, dialogs, or bulk migrations.

## Phase 3: React tooltip foundation

Start after phase 2 lands so React can reuse its timing and Escape coordination.

### Public components

- `Tooltip` is description-only, accepts a plain string, and wraps an already named interactive control.
- `IconButton` owns visual label tooltip behavior. One required `label` supplies the stable accessible name and visual bubble so the strings cannot drift.
- Keep `OverlayTrigger` for legacy callsites. Do not deprecate it or add a lint rule until its valid uses are gone.
- Keep Bootstrap visual classes, 500 ms timing, hover retention, touch omission, Escape behavior, and transition behavior aligned with vanilla.

### Initial callsites

- Use the TanStack table clear-search or clear-filter action as the `IconButton` proof because it is an actual icon action whose accessible label already exists.
- Use “Reset question variants” as the description proof only if its consequential explanation remains in the confirmation dialog. Otherwise choose another control.

### Checks

- Extend the real-browser spec with one React label consumer and one React description consumer; do not retest React Aria internals.
- Verify that the accessible name stays stable and no duplicate description appears.
- Verify the description consumer retains its own accessible name and gains only the intended description.
- Open a vanilla and React tooltip concurrently in the integration fixture and confirm one Escape closes both without closing an enclosing Bootstrap modal.
- Repeat the phase 2 pointer, touch, zoom, reduced-motion, and VoiceOver checks on the two real consumers.

Add a minor changeset and document only the components that ship.

## Phase 4: migrate tooltips in semantic batches

Do not convert every `OverlayTrigger` or `data-bs-*` use at once. Track callsites in an issue and migrate by category:

1. **Icon-action visual labels:** clear, search, close, QR code, regenerate, upload, rename, and similar genuine actions.
2. **Named-control descriptions:** short optional explanations that supplement visible control labels.
3. **Status cleanup:** remove focusable status wrappers and preserve compact static badges with enough visible context to stand alone. For the manual-grading assessment-open state, use a warning badge containing the triangle and visible “Open” text; do not rely on a bare icon, tooltip, or visually hidden expansion.
4. **Required guidance:** move prerequisites, consequences, validation, and remediation into visible page content or confirmation dialogs.
5. **Native time titles:** use semantic `<time>` plus redundant `title` only where exact precision is optional.

Each batch should:

- touch one semantic family and a small set of pages;
- include its own manual test locations in the PR description;
- add automated coverage only for a new behavior not already protected at the component boundary;
- recount remaining legacy usages after merge;
- add no global lint rule until remaining valid uses can be represented accurately.

## Phase 5: contextual-help prototype validation

Use a disposable prototype, not a production component. Implement the selected Carbon-style interaction with Fluent's content and naming guidance, then test:

- one short paragraph;
- one paragraph plus one documentation link;
- the current three-link instructor-preview Tools help;
- a small repeated set in a form or table header.

Test keyboard behavior in Chrome and Firefox, one desktop screen reader, sighted iOS and Android, and one physical mobile screen reader. Expand only when results differ by platform. Record DOM placement, announcement, reading navigation, Tab/Shift+Tab, Escape, outside press, collision, and zoom. Write a short decision record; do not open a production PR for the prototype.

If the model fails, use visible help or disclosure. If it passes, implement the same React and vanilla contract with the Tools help and one React callsite. PrairieTest adopts the released package afterward.

## Phase 6–8: PrairieTest anchored editors

Do not migrate PrairieTest inline editors mechanically. The audit found no immediate-save editor: typed and custom editors use explicit completion and cancellation, and the four `onlyCancel` cases are explanations. Do not add a nonmodal variant.

### Prototype first in PrairieTest

On a disposable local PT branch, implement the contained-focus task-dialog contract for exactly three cases:

1. One ordinary typed single-field `InlineEdit`.
2. Self-reservation editing with its Flatpickr calendar rendered inside the dialog overlay root.
3. An edit whose successful HTMX response replaces or removes its trigger.

The prototype must demonstrate:

- accessible dialog title and initial focus;
- Tab/Shift+Tab containment;
- explicit Save and Cancel;
- the shared pristine/sticky-dirty outside-press rule;
- topmost Escape behavior with Flatpickr;
- focus resolution after swap, no-swap, out-of-band-only, redirect, and cancellation outcomes;
- usable layout on touch and at 200%/400% zoom.

Do not use the multi-field overrides editor or proctor-assignment table as prototypes; evaluate them as modals, panels, inline regions, or pages.

### Extract only what proved generic

After the three cases pass, separate responsibilities:

- `@prairielearn/ui` owns Bootstrap dialog-popover semantics, focus containment, ownership/teardown, nearest-overlay-root behavior, and nested-overlay Escape ordering.
- PrairieTest owns HTMX request lifecycle, dirty-state integration with its forms, success-focus resolution, and the `InlineEditPopover` API.

Prototype with a locally packed `@prairielearn/ui`. Release the shared package before opening the production PrairieTest migration, which must use the published version.

Migrate the typed text, number, URL, boolean, select, and datetime families first. Classify every `CustomInlineEdit`, `.btn-inline-edit` styling use, and `onlyCancel` explanation separately, then pause before the next group.

## Browser integration fixture strategy

Use one small Playwright spec for overlay infrastructure rather than spreading interaction assertions across feature tests. Run it against the normal PL server and production bundles, adding fixture markup only for combinations that do not occur on one page.

This fixture is appropriate for:

- actual pointer and keyboard events;
- actual Bootstrap lifecycle events and generated DOM;
- dynamic DOM insertion/removal;
- React/vanilla coexistence;
- nested Bootstrap modal behavior;
- programmatic construction and teardown.

It is not sufficient evidence for:

- exact screen-reader speech;
- physical touch behavior;
- large-pointer transit and collision at zoom;
- visual parity across themes;
- whether copy/help text is the right product content.

Record those checks in the relevant PR with browser and assistive-technology versions. Once the shared contract is proven, migration PRs do not need to repeat the full matrix.

## Rollback boundaries

- Every installer is abortable, idempotent, and leaves legacy Bootstrap markup operational.
- Ordinary Bootstrap markup and constructors keep working; ambiguous content stays on the compatibility path.
- `OverlayTrigger` remains available during React migration.
- PrairieTest adopts only published package versions and can revert a dependency update independently of PrairieLearn deployment.
- If a prototype fails, use visible content, disclosure, a modal, or inline editing instead of publishing a component that does not fit.

## Decisions before phase 2 implementation

1. Whether any first-party tooltip needs a narrow internal override beyond ordinary Bootstrap markup and accessible naming.
2. Which existing callsite proves vanilla description treatment without inventing a description.
3. The physical trigger-to-tooltip persistence technique that survives slow transit and zoom without intercepting adjacent targets.
4. Which React callsite the integration spec should use so it exercises production hydration rather than a test-only renderer.

Start phase 2 from a clean `master` worktree with only the compatibility spike and browser reproducer. Do not write public documentation or migrate callsites until decisions 1 and 3 are settled.
