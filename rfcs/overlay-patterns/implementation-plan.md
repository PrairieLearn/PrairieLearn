# Overlay patterns implementation plan

Status: proposed implementation sequence for the decisions in [Overlay interaction patterns plan](./design.md).

## Starting assumptions

- Close the existing contextual-popover and tooltip PRs rather than adapting their branches. They remain useful as read-only implementation references, but their generic `Popover`, broad callsite migrations, and universal dialog behavior are not an appropriate base for the revised design.
- Start every replacement branch from current `master`. Do not cherry-pick an old commit wholesale; copy or reimplement only a reviewed, still-correct hunk.
- Keep the old branches and PR history available until the replacement work has recovered every intentionally retained fix. Closing a PR does not require deleting its branch.
- Do not create one stack spanning tooltip foundations, contextual-help research, application-wide migration, and PrairieTest editors. Those efforts have different evidence gates and should not keep one another perpetually unmergeable.
- Prefer sequential foundation PRs over a speculative stack: merge the vanilla foundation, then build the React foundation from the new `master`. Run contextual-help and editor prototypes in parallel on disposable local branches because they do not need to block tooltip work.

## Delivery and confidence model

Every production PR should satisfy four rules:

1. **Independently safe:** the application is deployable after that PR without depending on a later layer to restore behavior or accessibility.
2. **One contract at a time:** a foundation PR proves one interaction contract with one or two representative consumers. Bulk migration is separate.
3. **Real-browser evidence:** browser-owned behavior is tested in an actual browser with actual Bootstrap or React Aria. Do not add Vitest tests that mock Bootstrap, timers, DOM geometry, focus, or event propagation merely to assert controller plumbing.
4. **Explicit expansion gate:** broaden usage only after the proof consumers pass their automated, manual, and assistive-technology checks. A passing typecheck is not evidence that a focus or pointer contract works.

Use this confidence ladder for each new pattern:

1. Establish a baseline reproducer against `master` and record the failure or current behavior.
2. Implement the smallest runtime contract without migrating unrelated callsites.
3. Exercise it in a real-browser integration fixture and one real application page.
4. Manually test mouse, slow pointer movement, keyboard, Escape, touch/coarse pointer, zoom, and reduced motion as applicable.
5. Test screen-reader output for new naming, description, disclosure, dialog, or live-region semantics.
6. Migrate a deliberately chosen proof consumer.
7. Pause for review and real use before beginning a semantic batch.
8. After each batch, recount remaining legacy callsites and use what was learned to adjust the next batch rather than committing to a repository-wide mechanical rewrite.

## Proposed sequence

| Phase | Deliverable                                                 | Relationship                                              | Expansion gate                                                                |
| ----- | ----------------------------------------------------------- | --------------------------------------------------------- | ----------------------------------------------------------------------------- |
| 0     | Retire the current PRs and establish clean baselines        | Administrative; no code dependency                        | Replacement plan and salvage inventory agreed                                 |
| 1     | Small independently justified correctness fixes             | Separate PRs from `master`; not part of a long stack      | Each bug reproduces on `master` and has focused coverage                      |
| 2     | Permanent vanilla Bootstrap tooltip foundation              | First foundation PR                                       | Real-browser contract passes in PL and against a locally packed package in PT |
| 3     | React `Tooltip` and `IconButton` foundation                 | Begin after phase 2 merges                                | One description and one visual-label consumer pass manual and AT checks       |
| 4     | Tooltip migrations by semantic family                       | Small independent PRs                                     | Prior batch is reviewed and remaining inventory is reclassified               |
| 5     | Contextual-help prototype validation                        | Disposable branch, parallel with phases 2–4               | The selected model passes representative physical-device and AT checks        |
| 6     | Shared contextual-help implementation, if justified         | New foundation PR after phase 5                           | React and vanilla proof consumers satisfy the same contract                   |
| 7     | PrairieTest anchored-editor prototype                       | Disposable PT branch after phase 2 integration stabilizes | Simple edit, Flatpickr, and HTMX replacement cases all pass                   |
| 8     | Extract shared dialog behavior and migrate typed PT editors | PL package PR and release, then PT PR                     | Typed editor family passes; every custom editor is separately classified      |
| 9     | Longer-term visible-help/disclosure cleanup                 | Independent product-facing PRs                            | Each page is reviewed as a workflow, not as a tooltip count                   |

## Phase 0: replace rather than restack

Before closing the current PRs, create a short salvage inventory with three outcomes for every non-callsite-specific change:

- **Reimplement:** the behavior remains part of the approved plan, but should be rewritten from `master` with the new contract. Examples include hover retention, touch suppression, transition recovery, deterministic teardown, and Bootstrap-compatible styling.
- **Extract as an independent fix:** the change is useful without either proposed overlay abstraction. Candidates include the `QuestionNavigation` HTML transport correction and copy-completion live-region behavior, but only after each issue is reproduced and its escaping/announcement boundary is revalidated on current `master`.
- **Discard:** generic public `Popover`, `HelpPopover`, universal popover-as-dialog conversion, repeated help buttons, pressable unavailable actions, broad administrator/rubric/sync redesigns, and migration-only lint rules.

Initial inventory from the current branches:

| Existing work                                                                                                                 | Outcome                                                                        | Destination                     |
| ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | ------------------------------- |
| Vanilla hover retention, modality tracking, transition recovery, instance ownership, teardown, and Bootstrap issue references | Reimplement after review, not wholesale cherry-pick                            | Phase 2                         |
| React Aria positioning, Bootstrap class mapping, transition styling, and hover-retention experiments                          | Reimplement after review                                                       | Phase 3                         |
| Moving PL's application bootstrap to a consumer-supplied `@prairielearn/ui` installer                                         | Reimplement with the settled signal and host integration                       | Phase 2                         |
| `QuestionNavigation` rich-content transport change                                                                            | Reproduce and extract only if current output is wrong                          | Independent phase 1 PR          |
| Clipboard live announcement and visual “Copied” state                                                                         | Reproduce and extract as status behavior                                       | Independent phase 1 PR          |
| Legacy popover-inside-modal Escape correction                                                                                 | Reproduce in a real browser, then extract narrowly                             | Independent phase 1 PR          |
| `FriendlyDate` semantic `<time>` plus optional exact native `title`                                                           | Revalidate exact-date importance across consumers, then extract                | Independent product PR          |
| Bootstrap 6-compatible `.btn-icon` backport                                                                                   | Retain only if the surviving `IconButton` or contextual-help trigger uses it   | Phase 3 or phase 6              |
| Generic public React `Popover`, `HelpPopover`, public docs, and changeset                                                     | Discard                                                                        | None                            |
| Universal vanilla popover dialog conversion and empty-focus-trap change                                                       | Discard; replace only after the PT editor prototype proves a narrower contract | Phase 7–8 research              |
| Broad callsite conversions, pressable unavailable actions, repeated help buttons, and status-to-button conversions            | Discard and later reclassify from `master`                                     | Phase 4 or phase 9              |
| `OverlayTrigger` tooltip deprecation and migration-wide lint failures                                                         | Discard until valid legacy consumers reach zero                                | Possible late migration cleanup |
| Regression fixes that only repaired branch-introduced changes to save/edit semantics                                          | Discard automatically by restarting from `master`                              | None                            |

Do not delete the old branches when the PRs are closed. Reference them by commit when reimplementing subtle Bootstrap lifecycle behavior, and record in each replacement PR which old ideas were deliberately retained or rejected.

## Phase 1: independent correctness fixes

These are not prerequisites for the tooltip foundation and should not be combined merely because the old PR discovered them:

### Rich HTML transport

- Inventory every surviving HTML-mode Bootstrap popover after first-party callsites are reclassified. For each one, record the trust source and transport boundary: TypeScript `HtmlSafeString` attribute, JSX/React attribute, Mustache/Python rendering, jQuery or programmatic string, direct DOM node, or course/third-party-authored content.
- Reproduce the exact `HtmlSafeString`-inside-attribute behavior on `master` with plain text, markup, quotes, ampersands, and untrusted text.
- Define which layer performs HTML escaping and which layer performs HTML-attribute serialization. Test the rendered DOM/content boundary, not private tagged-template calls.
- Make the smallest correction only if the current output is wrong. Do not globally change Bootstrap HTML popover serialization based on one callsite.

### Copy completion

- Treat “Copied” as action status rather than a tooltip description.
- Use one pre-existing or pre-mounted polite status source per completion and retain useful visible feedback.
- Validate repeated copying and copying from two different controls at a normal user cadence. Do not promise reliable delivery for an artificial rapid-fire sequence.

### Legacy nested-overlay Escape behavior

- First add a real-browser reproducer for a legacy interactive popover inside a Bootstrap modal.
- If the same Escape currently closes both layers, fix only the same-event double dismissal and focus restoration. Do not turn that correction into a general cross-runtime overlay manager.

### Friendly dates

- Inventory `FriendlyDate` consumers and separate audit-sensitive timestamps from ordinary relative display.
- Render semantic `<time datetime="…">` in both cases.
- Use native `title` with the exact value only when that precision is genuinely optional and losing it on touch is acceptable. Provide a visible or press-accessible exact value for audit-sensitive uses.
- Remove the component's overlay option if the inventory confirms no surviving consumer needs a press-accessible exact value.

Each of these may be its own small PR. If a candidate no longer reproduces on `master`, drop it.

## Phase 2: permanent vanilla tooltip foundation

This is the first main implementation PR. Its purpose is to provide a durable tooltip path for PrairieLearn, PrairieTest, first-party elements, third-party elements, and course-authored content.

### Transparent compatibility spike

Resolve the transparent behavior before writing the changeset or documentation. Prototype it against three concrete consumers:

1. A declarative dynamically inserted tooltip.
2. A PrairieLearn programmatic tooltip with a changing label, such as the side-navigation toggle.
3. A direct-construction compatibility fixture, plus an existing dynamically rendered PrairieTest declarative tooltip when smoke-testing the packed package.

The package integration should have these properties:

- `installBootstrapTooltipBehavior` receives the consumer's `document`, Bootstrap `Tooltip` constructor, and an `AbortSignal`; it does not import or bundle Bootstrap. The signal is the one documented cancellation mechanism rather than being duplicated by an equivalent returned disposer.
- Installation is idempotent per document. Aborting removes every owned document listener, observer, controller, and generated instance without disposing an externally owned replacement.
- Existing direct `new bootstrap.Tooltip(...)` calls receive the compatibility baseline through delegated public lifecycle events and `getInstance`, including instances created after installation. Course and third-party scripts do not import a PrairieLearn API.
- Ordinary declarative Bootstrap markup is the documented authoring surface. The adapter infers label treatment for an icon-only control whose tooltip matches its accessible name and description treatment for a visibly named control with distinct tooltip text. Ambiguous legacy markup remains operational through the compatibility baseline.
- Do not expose a PrairieLearn browser-global factory or require `data-pl-tooltip-mode`. Add a narrowly typed internal override only if this spike finds a concrete first-party case that ordinary Bootstrap markup and accessible naming cannot express.

Do not expose arbitrary roles, focus policies, semantic modes, or raw overlay hooks. This is transparent tooltip compatibility, not a second authoring system or the eventual contextual-help/dialog API.

### Behavior

- Retain Bootstrap appearance and transitions.
- Start with a 500 ms initial pointer-hover delay, immediate keyboard-focus opening, and a 500 ms close delay.
- Keep the tooltip open over the trigger, through a physically traversable trigger-to-tooltip path, and while the tooltip itself is hovered. A timer alone is insufficient.
- Track input modality so touch-generated focus and compatibility mouse events do not open it and do not consume the control's first tap.
- Close on Escape without moving focus or closing an enclosing modal/popover on the same key event.
- Recover correctly if renewed hover/focus requests opening during the Bootstrap exit transition.
- Support dynamic insertion, removal, title/name changes, mixed Bootstrap actions on one trigger, external instance disposal/recreation, and installer abort/reinstall.
- When label treatment is unambiguous, use the trigger's continuously present accessible name as the single caller-authored string. Render it visually, hide the duplicate bubble from the accessibility tree, and remove Bootstrap's redundant description.
- When description treatment is unambiguous, keep the independently named control and retain one nonredundant `aria-describedby` relationship while open.

### Proof consumers

Choose one vanilla label tooltip and one vanilla description tooltip already reachable on ordinary PL pages. Prefer a dynamic-label consumer such as the side-navigation toggle for the label proof. Do not convert an informational popover merely to manufacture a description proof.

### Automated confidence

Add a lean Playwright spec that loads the real PrairieLearn application bundle and actual Bootstrap. It may insert fixture triggers into an ordinary page DOM so long as it uses the production installer and browser event system. Cover only behavior owned by this layer:

1. Inferred label versus description accessibility relationships, including a dynamic label update.
2. Real pointer movement from trigger to tooltip, Escape dismissal, and no touch-triggered opening or lost primary activation.
3. Dynamic insertion and removal, programmatic creation, abort/reinstall, and external instance replacement without stale ownership.

Do not reproduce the matrix with mocked Vitest DOM tests. Keep visual collision, screen-reader speech, and large-pointer transit as manual checks because headless assertions do not establish those properties.

### Manual confidence and exit criteria

- Chrome and Firefox keyboard/mouse checks on the proof callsites.
- Safari/VoiceOver confirms label mode is announced once and description mode supplies one nonredundant description.
- Sighted iOS Safari and Android Chrome confirm no tooltip opens and the action remains one-tap operable.
- Slow pointer transit with ordinary and large pointer settings at 100%, 200%, and 400% zoom.
- Reduced-motion behavior and interrupted exit transition.
- Local-package smoke test in PrairieTest using a packed tarball or isolated dependency override; do not commit a temporary filesystem dependency.
- Build, targeted typecheck/lint/format, the Playwright spec, and normal CI pass.

The PR includes the required `@prairielearn/ui` changeset and documents the importable host installer plus ordinary Bootstrap authoring for first-party elements, third-party elements, and course content. It does not add a PrairieLearn browser API, React components, contextual help, dialogs, or bulk callsite migrations.

## Phase 3: React tooltip foundation

Begin this PR after phase 2 lands so it can reuse the production tooltip-only Escape coordination and settled timing without restacking.

### Public components

- `Tooltip` is description-only, accepts a plain string, and wraps an already named interactive control.
- `IconButton` owns visual label tooltip behavior. One required `label` supplies the stable accessible name and visual bubble so the strings cannot drift.
- Keep `OverlayTrigger` available and unchanged for legacy callsites. Do not deprecate or lint against it until migrations show that every remaining use has an appropriate replacement.
- Keep Bootstrap visual classes, 500 ms timing, hover retention, touch omission, Escape behavior, and transition behavior aligned with vanilla.

### Proof consumers

- Use the TanStack table clear-search or clear-filter action as the `IconButton` proof because it is an actual icon action whose accessible label already exists.
- Use the visible “Reset question variants” action as the description proof only if its confirmation dialog continues to contain the consequential explanation, making the tooltip genuinely supplemental. Otherwise select another named control rather than weakening the content rule.

### Confidence

- Extend the real-browser spec with one React label consumer and one React description consumer; do not retest React Aria internals.
- Verify the accessible name is stable with the visual label closed, open, and dismissed, and that no duplicate description appears.
- Verify the description consumer retains its own accessible name and gains only the intended description.
- Open a vanilla and React tooltip concurrently in the integration fixture and confirm one Escape closes both without closing an enclosing Bootstrap modal.
- Repeat the phase 2 pointer, touch, zoom, reduced-motion, and VoiceOver checks on the two real consumers.

The PR adds a separate minor changeset for the React public API and updates the README only for contracts that now ship.

## Phase 4: migrate tooltips in semantic batches

Do not convert all existing `OverlayTrigger` or `data-bs-*` usages in one PR. Maintain an issue checklist with every callsite classified by user need, then work in batches such as:

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
- avoid introducing a global lint restriction until the old API has no valid tooltip consumers or the restriction can accurately grandfather them.

## Phase 5: contextual-help prototype validation

Use a disposable development-only prototype rather than production components. Implement the selected Carbon-style toggletip interaction, informed by Fluent's content, naming, and density guidance, and exercise actual content shapes:

- one short paragraph;
- one paragraph plus one documentation link;
- the current three-link instructor-preview Tools help;
- a small repeated set in a form or table header.

Use the shared confidence ladder and a proportional manual matrix: keyboard in current Chrome/Firefox, one current desktop screen reader, both sighted mobile platforms, and at least one current physical mobile screen reader. Expand to another AT/platform when a result is inconsistent or exposes a platform-specific risk. Record DOM placement, announcement on open, browse/swipe discoverability, Tab and Shift+Tab destinations, Escape, outside press, collision, and zoom. The result is a short decision record, not a production PR.

If the selected model does not pass consistently, stop and use visible help or disclosure. If it passes, implement React and vanilla forms of the same frozen contract in one focused foundation PR with the Tools help and one React callsite as proofs. PrairieTest consumes the released package afterward.

## Phase 6–8: PrairieTest anchored editors

Treat the existing PT inline-edit system as product evidence, not as a set of callsites to migrate mechanically. The audit found no immediate-apply or autosave anchored editor: the typed and custom editor families use explicit Save/Cancel or an explicit action plus Cancel, and the four `onlyCancel` cases are unavailable explanations. Do not design or expose a nonmodal editor variant in these phases.

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

Do not prototype the multi-field overrides editor or proctor-assignment table as anchored dialogs; evaluate those as modal, panel, inline-region, or page workflows.

### Extract only what proved generic

After the three cases pass, separate responsibilities:

- `@prairielearn/ui` owns Bootstrap dialog-popover semantics, focus containment, ownership/teardown, nearest-overlay-root behavior, and nested-overlay Escape ordering.
- PrairieTest owns HTMX request lifecycle, dirty-state integration with its forms, success-focus resolution, and the purpose-specific `InlineEditPopover` API.

Prototype against a locally packed `@prairielearn/ui`, then land and release the shared package PR before opening the production PT migration PR. The PT PR must consume a published package version, not a committed local path or copied permanent controller.

Migrate only the typed text, number, URL, boolean, select, and datetime families first. Classify every `CustomInlineEdit`, `.btn-inline-edit` styling use, and `onlyCancel` explanation separately. Pause after the typed family before selecting the next group.

## Browser integration fixture strategy

Use one small Playwright spec for overlay infrastructure rather than scattering UI-mechanics assertions across feature tests. The spec should run against the normal PL server and production bundles, then create only the minimal fixture markup needed for combinations that do not naturally coexist on one page.

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

Record those as a short manual matrix in the relevant PR, with browser/AT versions. Do not copy the entire matrix into every migration PR once the shared contract is proven.

## Rollback boundaries

- Every installer is abortable, idempotent, and leaves legacy Bootstrap markup operational.
- Transparent enhancements leave ordinary Bootstrap markup and constructors operational; ambiguous content remains on the compatibility baseline rather than being silently reinterpreted.
- `OverlayTrigger` remains available during React migration.
- PrairieTest adopts only published package versions and can revert a dependency update independently of PrairieLearn deployment.
- A failed contextual-help or editor prototype is a valid outcome; visible content, disclosure, modal, or inline editing remain the fallback without stranding a half-public abstraction.

## Decisions required before phase 2 code freezes

1. Whether the spike identifies any concrete first-party case that requires a narrow internal semantic override beyond ordinary Bootstrap markup and accessible naming.
2. Exact proof callsites for inferred vanilla description treatment; do not invent a description merely to exercise the behavior.
3. The physical trigger-to-tooltip persistence technique that survives slow transit and zoom without intercepting adjacent targets.
4. Where the integration spec should obtain a React proof consumer so it uses production hydration rather than a test-only React renderer.

The first implementation step should be a clean `master` worktree containing only the phase 2 compatibility spike and baseline browser reproducer. No public documentation or callsite migration should be written until that spike resolves decisions 1 and 3.
