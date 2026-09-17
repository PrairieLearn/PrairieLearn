# Overlay patterns implementation plan

Status: proposed sequence for the [overlay interaction patterns RFC](./design.md).

## Starting assumptions

- Remove unnecessary overlays before designing or building their replacements. The current taxonomy is a cleanup rubric, not a commitment to ship every proposed component.
- Close the old tooltip and contextual-popover PRs. Keep their branches as references, but do not use their generic `Popover`, broad migrations, or universal dialog behavior as a base.
- Start each cleanup or replacement branch from current `master`. Reimplement only the old pieces that survive the cleanup and still fit the RFC.
- Bootstrap remains a permanent compatibility surface for first-party elements, third-party elements, and course content. Reducing application-owned overlays does not remove that obligation.
- Do not leave an urgent accessibility defect unfixed solely because the cleanup is incomplete. Prefer eliminating the overlay; otherwise make the narrowest correction needed for the surviving behavior.

## How to work

Each cleanup PR should:

1. Address one user-facing problem or one closely related family of callsites.
2. Record the current behavior on a real page, usually with a screenshot.
3. Prefer visible text, clearer labels, static status, native semantics, disclosure, an established widget, or a dedicated view over another overlay.
4. Preserve the information, accessible name, action semantics, and feedback that users rely on.
5. Include proportional browser checks and before/after screenshots. Add automated coverage only for behavior owned by the changed layer.
6. Recount and reclassify the affected overlay inventory after merge.

Each PR must be deployable on its own. Independent PrairieLearn and PrairieTest cleanups may proceed concurrently, but do not build a long stack spanning both applications or several interaction patterns.

During the cleanup loop, do not add a generic overlay abstraction, a global migration lint rule, or a replacement tooltip merely to preserve the previous layout. New first-party code should use an overlay only when its need is already clear under the RFC.

## Proposed sequence

| Phase | Deliverable                                             | Before advancing                                                              |
| ----- | ------------------------------------------------------- | ----------------------------------------------------------------------------- |
| 0     | Retire old implementation PRs and establish inventories | Salvage decisions and search coverage are recorded                            |
| 1     | Repeated small overlay-removal PRs in PL and PT         | Every remaining first-party use has been reviewed                             |
| 2     | Survivor inventory and design review                    | Each survivor has a written justification and proposed pattern                |
| 3     | Permanent vanilla Bootstrap tooltip foundation          | Real-browser contract passes in PL and against a locally packed package in PT |
| 4     | React `Tooltip` and `IconButton` foundation             | One description and one visual-label callsite pass manual and AT checks       |
| 5     | Migration of surviving genuine tooltips                 | Remaining legacy tooltip uses are either justified or tracked                 |
| 6     | Contextual-help prototype, if survivors require it      | The model passes representative physical-device and AT checks                 |
| 7     | Shared contextual-help implementation, if justified     | React and vanilla callsites satisfy the same contract                         |
| 8     | PrairieTest anchored-editor prototype                   | Simple edit, Flatpickr, and HTMX replacement cases all pass                   |
| 9     | Shared dialog behavior and typed editor migration       | The typed editor family passes; every custom editor is separately classified  |

## Phase 0: retire and inventory

Classify non-callsite work from the old branches into three groups:

- **Reimplement:** still required after cleanup, but rewrite from `master` under the revised contract.
- **Extract:** an independent bug fix that reproduces on `master` and remains relevant without the rejected abstraction.
- **Discard:** tied to a rejected abstraction, a removed callsite, or a broad migration.

Initial inventory from the current branches:

| Existing work                                                                                                      | Outcome                                                                         |
| ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------- |
| Vanilla hover retention, modality, transitions, ownership, teardown, and Bootstrap issue references                | Revisit in phase 3 after the survivor review                                    |
| React Aria positioning, Bootstrap class mapping, transition styling, and hover-retention experiments               | Revisit in phase 4 after the survivor review                                    |
| Consumer-supplied `@prairielearn/ui` Bootstrap installer                                                           | Reimplement in phase 3 if the settled contract still requires it                |
| `QuestionNavigation` rich-content transport change                                                                 | Prefer removing the popover; test escaping only if a rich-content path survives |
| Clipboard live announcement and visual “Copied” state                                                              | Extract as status behavior; it does not depend on a tooltip foundation          |
| Legacy popover-inside-modal Escape correction                                                                      | Extract only if the legacy case still exists and reproduces                     |
| `FriendlyDate` semantic `<time>` plus optional native `title`                                                      | Continue as independent overlay-removal work                                    |
| Bootstrap 6-compatible `.btn-icon` backport                                                                        | Retain only if a surviving component needs it                                   |
| Generic public React `Popover`, `HelpPopover`, public docs, and changeset                                          | Discard                                                                         |
| Universal vanilla popover dialog conversion and empty-focus-trap change                                            | Discard; the editor prototype may later justify a narrower contract             |
| Broad callsite conversions, pressable unavailable actions, repeated help buttons, and status-to-button conversions | Discard and reclassify from `master`                                            |
| `OverlayTrigger` deprecation and migration-wide lint failures                                                      | Discard until remaining valid uses reach zero or have accurate replacements     |
| Fixes for regressions introduced only by the old branches                                                          | Discard                                                                         |

Keep the old branches until all retained work has landed. Reference specific commits when reusing subtle Bootstrap lifecycle behavior.

The inventories must include direct and indirect uses: `OverlayTrigger`, React Bootstrap overlays, `data-bs-*` markup, native `title`, shared helpers such as `HelpTooltip`, `IconWithTooltip`, and `IconWithPopover`, direct Bootstrap constructors, and generated markup in elements or client scripts. Record whether each use is React, server-rendered, vanilla, element-owned, third-party, or course-authored.

## Phase 1: overlay-removal loop

Work by user need rather than implementation name. Recommended order:

1. Student-facing information required to understand access, scoring, navigation, availability, or remediation.
2. Shared renderers where one change removes overlays from many pages.
3. Static status icons, badges, abbreviations, and artificial tab stops.
4. Explanations attached to disabled or unavailable actions.
5. Table-header and form help that should be visible copy or disclosure.
6. Press-triggered popovers whose content belongs in page flow, a modal, a menu, or a dedicated view.
7. Redundant label and description tooltips.

The first PrairieLearn cleanup PRs establish the desired size and review style:

- show open manual-grading assessments as a static “Open” warning badge;
- show unavailable student information as visible text;
- remove redundant manual-grading status tooltips;
- render friendly dates as semantic `<time>` with an optional native `title`.

Known follow-up candidates include:

| Application  | Area                                      | Likely no-overlay treatment                                                    |
| ------------ | ----------------------------------------- | ------------------------------------------------------------------------------ |
| PrairieLearn | Group-role table headers                  | Clearer headings plus one visible introduction; remove `HelpTooltip`           |
| PrairieLearn | Required modules and referenced sets      | Omit unavailable delete actions and show “Required” or “Used by N assessments” |
| PrairieLearn | Locked question navigation                | Disabled action with its reason visible nearby                                 |
| PrairieLearn | Student access schedules                  | Native disclosure containing the schedule table                                |
| PrairieLearn | Zone scoring and points explanations      | Visible zone summary or table description                                      |
| PrairieLearn | AI/human manual-grading comparison        | Visible column labels; remove per-checkbox tooltips                            |
| PrairieLearn | Static warnings and count badges          | Self-explanatory text such as “Ignored,” “Not counted,” or “N to grade”        |
| PrairieLearn | AI credit balance definitions             | Short text inside the cards                                                    |
| PrairieTest  | Friendly dates and ranges                 | Semantic time markup and redundant native `title`, without Bootstrap           |
| PrairieTest  | Paper-exam indicators                     | Visible “Paper” or “Paper reservations” badges                                 |
| PrairieTest  | Reservation-extension mismatches          | Visible mismatch and expected value                                            |
| PrairieTest  | Redundant invite-status explanations      | Keep visible status; move real workflow guidance above the table               |
| PrairieTest  | Student session availability and location | Visible slot definition and location description                               |
| PrairieTest  | Table-header help                         | Table caption, card introduction, or section-level disclosure                  |
| PrairieTest  | Prediction errors and minimap legends     | Inline warning and native disclosure                                           |

This table is a starting backlog, not approval to make each listed change mechanically. Review the whole page, preserve useful information, and split work when different callsites need different answers.

Independent correctness work may proceed during this loop when it remains necessary after the overlay is removed or reclassified:

- Treat “Copied” as action status. Use one pre-mounted polite status source and retain useful visible feedback.
- Test rich HTML only at serialization boundaries that survive. Define which layer escapes content and which serializes the attribute; do not make a global change from one callsite.
- Fix nested Escape propagation only for a current reproducible case. Do not build a general overlay manager during cleanup.

### Exit criteria

Phase 1 ends only when the first-party inventory contains no unreviewed use and all of the following are true:

- No static element is focusable solely to expose a tooltip.
- No status icon or badge depends on hover or focus for its meaning.
- No essential instruction, prerequisite, consequence, validation message, or remediation exists only in an overlay.
- No unavailable action is made pressable solely to explain why it is unavailable.
- No first-party popover remains when visible content, disclosure, a menu, a modal, or a dedicated view is clearly better.
- Each remaining tooltip is concise, plain text, noninteractive, and optional on touch.
- Each remaining press-triggered popover has an identified user need that cannot be met more simply in page flow.
- Legacy, third-party, element, and course-authored uses are separated from application-owned migration work.

## Phase 2: survivor inventory and design review

For every remaining first-party overlay, record:

- the user need and whether the information is optional;
- content shape, including links or controls;
- trigger and expected behavior for mouse, keyboard, touch, screen readers, magnification, and voice control;
- why visible text, disclosure, an established widget, or a dedicated view is not better;
- React or vanilla ownership and whether equivalent behavior is needed in the other runtime;
- whether the use is application-owned, element-owned, third-party, or course-authored.

Revisit the RFC's proposed component set against this inventory. Remove any proposed public component with no clear survivors. Define APIs from representative survivors rather than from the abandoned implementations.

Do not start the replacement foundations until this review identifies the exact label-tooltip, description-tooltip, contextual-help, and anchored-task cases they must support. A valid outcome is that contextual help or a shared anchored-dialog component is not needed.

## Phase 3: permanent vanilla tooltip foundation

This phase provides one vanilla tooltip path for PrairieLearn, PrairieTest, elements, and course content. It may begin earlier only for a narrow urgent compatibility fix; the public foundation and documentation wait for phase 2.

### Compatibility prototype

Prototype three surviving cases:

1. A declarative dynamically inserted tooltip.
2. A PrairieLearn programmatic tooltip with a changing label, such as the side-navigation toggle.
3. A direct-constructor fixture and a dynamically rendered PrairieTest tooltip tested against the packed package.

The package integration should have these properties:

- `installBootstrapTooltipBehavior` receives the host `document`, Bootstrap `Tooltip` constructor, and an `AbortSignal`; it does not bundle Bootstrap. Use the signal as the documented cancellation API.
- Installation is idempotent per document. Aborting removes every owned document listener, observer, controller, and generated instance without disposing an externally owned replacement.
- Direct `new bootstrap.Tooltip(...)` calls receive compatible behavior through public lifecycle events and `getInstance`, including instances created after installation.
- Ordinary declarative Bootstrap markup remains the documented authoring surface. Infer label or description treatment only when naming makes it unambiguous; leave ambiguous legacy markup on the compatibility path.
- Do not expose a browser-global factory or require public `data-pl-*` semantic modes. Add a narrow internal override only if a surviving first-party case cannot use ordinary Bootstrap markup.

### Behavior

- Retain Bootstrap appearance and transitions.
- Start with a 500 ms hover delay, immediate keyboard opening, and a 500 ms close delay.
- Keep the tooltip open over the trigger, through a traversable trigger-to-tooltip path, and while the tooltip itself is hovered. A timer alone is insufficient.
- Track input modality so touch-generated focus and compatibility mouse events do not open it or consume the control's first tap.
- Close on Escape without moving focus or closing an enclosing modal or popover on the same key event.
- Recover if renewed hover or focus requests opening during the Bootstrap exit transition.
- Support dynamic insertion and removal, name changes, mixed Bootstrap actions, external instance replacement, and abort/reinstall.
- In label treatment, use the trigger's continuously present accessible name as the single caller-authored string, hide the visual duplicate from the accessibility tree, and remove Bootstrap's redundant description.
- In description treatment, keep the independently named control and one nonredundant `aria-describedby` relationship while open.

### Checks

Add a small Playwright spec using the real application bundle, Bootstrap, production installer, and browser event system. Cover:

1. Label versus description relationships, including a dynamic label update.
2. Real pointer movement, Escape dismissal, and no touch-triggered opening or lost primary activation.
3. Dynamic insertion and removal, programmatic creation, abort/reinstall, and external instance replacement without stale ownership.

Manually check Chrome and Firefox with keyboard and mouse; Safari with VoiceOver; sighted iOS Safari and Android Chrome; slow pointer transit at 100%, 200%, and 400% zoom; and reduced motion with an interrupted exit transition. Smoke-test a packed package in PrairieTest without committing a filesystem dependency.

The PR includes a changeset and documents the host installer and ordinary Bootstrap authoring. It does not add React components, contextual help, dialogs, or broad migrations.

## Phase 4: React tooltip foundation

Start after phase 3 lands so React can reuse its timing and Escape coordination.

- Public `Tooltip` is description-only, accepts a plain string, and wraps an already named interactive control.
- `IconButton` owns visual label tooltip behavior. One required `label` supplies the stable accessible name and visual bubble.
- Keep `OverlayTrigger` for legacy callsites. Do not deprecate it or add a lint rule until its valid uses are gone.
- Keep Bootstrap visual classes, timing, hover retention, touch omission, Escape behavior, and transitions aligned with vanilla.

Use one surviving icon action and one surviving description tooltip as the initial callsites. Extend the browser spec only for behavior owned by the React layer: stable naming, one nonredundant description, React/vanilla Escape coordination, and representative pointer and touch behavior. Do not retest React Aria internals.

Add a minor changeset and document only the components that ship.

## Phase 5: migrate surviving tooltips

Migrate only the tooltips approved in phase 2. Work in small semantic families:

1. Icon-action visual labels.
2. Named-control descriptions.
3. Legacy declarative or programmatic consumers that must remain Bootstrap-authored.

Each PR should list its manual test locations and add automated coverage only for behavior not already protected at the component boundary. Do not add a global lint rule until remaining valid uses can be represented accurately.

## Phase 6–7: contextual help, if justified

Use a disposable prototype before publishing a component. Test the actual survivors selected in phase 2, including the richest valid content shape and a repeated compact layout. Cover keyboard behavior in Chrome and Firefox, one desktop screen reader, sighted iOS and Android, and one physical mobile screen reader. Record DOM placement, announcement, reading navigation, Tab and Shift+Tab, Escape, outside press, collision, and zoom.

If the model fails, use visible help or disclosure. If it passes, implement the same React and vanilla contract with one real callsite in each runtime. PrairieTest adopts the released package afterward. Do not ship `ContextualHelp` merely because it appears in the provisional taxonomy.

## Phase 8–9: PrairieTest anchored editors

Do not migrate PrairieTest inline editors mechanically. The audit found no immediate-save editor: typed and custom editors use explicit completion and cancellation, and the four `onlyCancel` cases are explanations that should be removed during phase 1.

On a disposable PrairieTest branch, prototype the contained-focus task-dialog contract for exactly three cases:

1. One ordinary typed single-field `InlineEdit`.
2. Self-reservation editing with its Flatpickr calendar rendered inside the dialog overlay root.
3. An edit whose successful HTMX response replaces or removes its trigger.

The prototype must demonstrate an accessible title, initial and contained focus, explicit Save and Cancel, the shared pristine/sticky-dirty outside-press rule, topmost Escape behavior with Flatpickr, focus resolution after HTMX outcomes, and usable layout on touch and at 200%/400% zoom.

Do not use the multi-field overrides editor or proctor-assignment table as prototypes; evaluate them as modals, panels, inline regions, or pages.

If the prototype passes, separate responsibilities:

- `@prairielearn/ui` owns Bootstrap dialog-popover semantics, focus containment, ownership and teardown, nearest-overlay-root behavior, and nested-overlay Escape ordering.
- PrairieTest owns HTMX request lifecycle, dirty-state integration, success-focus resolution, and the `InlineEditPopover` API.

Prototype with a locally packed `@prairielearn/ui`. Release the shared package before opening the production PrairieTest migration, which must use the published version. Migrate the typed text, number, URL, boolean, select, and datetime families first, then pause before selecting another group.

## Browser integration fixture

After foundations exist, use one small Playwright spec for overlay infrastructure rather than spreading interaction assertions across feature tests. Run it against the normal PrairieLearn server and production bundles, adding fixture markup only for combinations that do not occur on one page.

The fixture is appropriate for real pointer and keyboard events, Bootstrap lifecycle events and generated DOM, dynamic insertion and removal, React/vanilla coexistence, nested Bootstrap modal behavior, programmatic construction, and teardown.

It cannot establish exact screen-reader speech, physical touch behavior, large-pointer transit, collision at zoom, visual parity, or whether the copy is appropriate. Record those checks in the relevant PR with browser and assistive-technology versions. Once a shared contract is proven, migration PRs need not repeat the full matrix.

## Rollback and exceptions

- Each cleanup PR leaves the application usable without a later replacement component.
- Existing Bootstrap markup and constructors remain operational throughout the cleanup.
- `OverlayTrigger` remains available during React migration.
- Every installer is abortable and idempotent.
- PrairieTest adopts only published package versions and can revert a dependency update independently of PrairieLearn deployment.
- If a prototype fails, use visible content, disclosure, a modal, or inline editing instead of publishing a component that does not fit.
- A narrow urgent fix may precede phase 2, but it must not expose a speculative public API or start a broad migration.

## Decisions before foundation implementation

1. Which exact surviving callsites require label and description tooltips in each runtime.
2. Whether any first-party vanilla tooltip needs a narrow internal override beyond ordinary Bootstrap markup and accessible naming.
3. Which pointer-persistence technique survives slow transit and zoom without intercepting adjacent targets.
4. Whether any contextual-help survivors justify a shared component rather than visible help or disclosure.
5. Which PrairieTest editor families fit the anchored-dialog contract.

Begin phase 3 from a clean `master` worktree with only the compatibility prototype and browser reproducer. Do not publish documentation or migrate callsites until the survivor inventory and decisions 1–3 are settled.
