# Overlay interaction patterns plan

Status: proposed RFC design. The abandoned contextual-popover and tooltip PRs remain implementation references only; replacement work starts from `master` and follows the separate [implementation plan](./implementation-plan.md).

This document defines how PrairieLearn and PrairieTest should present supplemental information, contextual help, unavailable-action explanations, interactive anchored content, and transient status.

## Executive decision

“Tooltip” and “popover” are visual descriptions, not a sufficient interaction taxonomy. Application code should select a component based on the user need and content semantics. Positioning and Bootstrap-compatible appearance should remain implementation details.

The intended component set is:

| User need                                                                                              | Preferred pattern                                                    |
| ------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------- |
| Expose a short visual label, shortcut, or nonessential description for an existing interactive control | `Tooltip`                                                            |
| Reveal a brief optional explanation, optionally with related documentation links                       | `ContextualHelp`                                                     |
| Explain stable instructions, prerequisites, constraints, or consequences                               | Visible helper text or section introduction                          |
| Explain validation failure or remediation for a particular control                                     | Adjacent inline validation message                                   |
| Communicate important state scoped to a section or page                                                | Section message or banner                                            |
| Reveal longer optional explanatory content in the page flow                                            | `Disclosure` or native `<details>`                                   |
| Perform a small reversible in-context edit or secondary task                                           | Contained-focus `DialogPopover`, usually through `InlineEditPopover` |
| Choose from a set of actions or options                                                                | Existing menu/listbox components                                     |
| Report recoverable transient action feedback or progress                                               | Visible local status or toast, backed by the appropriate live region |
| Preview an entity without navigating away                                                              | Future dedicated preview/hover-card pattern; not a tooltip           |
| Inspect rich read-only details, long logs, or compare information                                      | Inline expansion, side panel/peek, or dedicated view                 |
| Teach a newly introduced feature or guide onboarding                                                   | Dedicated coachmark/tour pattern with its own research contract      |
| Expose rich content on touch that does not fit contextual help                                         | Disclosure, preview, panel, or dialog—not a “rich tooltip” variant   |
| Require an exclusive decision or blocking task                                                         | Modal dialog                                                         |

The current rule that nearly every press-triggered Bootstrap popover or React `Popover` is a focus-trapped dialog should not become the application convention.

Use this decision path before adding an overlay:

1. Is the information required to understand, complete, or recover from the task? Keep it visible as helper text, validation, or a section/page message.
2. Is it a short visual label, shortcut, or nonredundant description of an existing interactive control? Use a tooltip.
3. Is it optional, local explanatory content with at most a few related navigational links and no state-changing controls? Contextual help may be appropriate after its focus and announcement model is validated.
4. Is it longer but still optional? Use a disclosure or `<details>`. If it must remain available while the user works elsewhere, use a panel or dedicated view.
5. Does floating content contain choices or controls? Use a menu/listbox for actions or selection. Consider a contained-focus anchored dialog only for one small task with explicit completion and cancellation. Prefer undo or inline confirmation for low-impact reversible actions, and use a full modal or page for high-impact, irreversible, multi-step, or spacious work. An optional region that remains in normal document flow may instead be a disclosure, including ordinary links or controls.
6. Is it action feedback or system state? Choose a local status, validation message, section/page message, or toast based on scope and urgency.
7. Is the intent to preview an entity, inspect rich detail, or teach a feature? Use that dedicated pattern rather than stretching tooltip or contextual help.

## Goals

- Give designers and engineers a small, predictable decision system that works for mouse, keyboard, touch, screen reader, magnification, and voice-control users.
- Keep React and server-rendered/vanilla experiences behaviorally equivalent where they implement the same pattern.
- Preserve Bootstrap-compatible visual styling and behavior across supported Bootstrap versions.
- Use React Aria as the behavioral foundation for React where it matches the chosen semantics.
- Treat the vanilla Bootstrap integration as a durable public compatibility layer for first-party elements, third-party elements, and course-authored question content. Individual version workarounds should remain explicit and removable when Bootstrap fixes them upstream.
- Prevent essential information from being hidden behind hover or a help icon.
- Avoid unjustified focus traps while retaining contained focus for actual dialogs; remove repetitive tab stops, duplicate announcements, and inaccessible nested overlays from changed callsites while quarantining untouched legacy behavior.
- Establish safe escaping and DOM-content rules for long-lived Bootstrap HTML popovers.
- Make the two foundational PRs independently reviewable, move bulk callsite redesigns into focused follow-ups, and avoid unnecessary CI churn.

## Non-goals

- Replacing Bootstrap, React Bootstrap, or React Aria across the application.
- Introducing Radix, Base UI, Floating UI, or another competing overlay stack.
- Rebuilding every menu, modal, dropdown, date picker, select, and combobox.
- Converting all static overlays to the native Popover API in this stack.
- Rewriting every legacy popover before either foundational PR can land.
- Designing preview cards, peek/side-sheet navigation, coachmarks/tours, or rich touch-tooltip variants in this stack; the taxonomy routes them so they are not forced into the components being built here.
- Treating administrator-only interfaces as exempt from accessibility and interaction-quality requirements.

## Research synthesis

The sources converge on content-based selection but do not converge on one universal “popover” interaction:

- The WAI-ARIA APG's explicitly work-in-progress tooltip pattern proposes a noninteractive text popup attached to hover/focus and dismissible with Escape. WCAG 1.4.13 independently requires hoverable content to remain available while the pointer is over it.
- Primer treats label and description tooltips as distinct relationships, reserves label tooltips primarily for existing icon buttons, forbids arbitrary structured content, and warns that tooltip information is unavailable or easily missed on touch and in some screen-reader navigation modes.
- React Aria similarly omits tooltips for touch interactions and defaults to delayed hover plus immediate focus. The installed React Aria version observes hover only on the trigger, however, so its primitives do not by themselves prove that PrairieLearn's rendered tooltip satisfies WCAG pointer persistence.
- Fluent's InfoLabel is a close precedent for brief contextual help: a label-associated info button, short supplemental content that may include formatting and a documentation link, inline non-trapped popover behavior, Escape and focus-leave dismissal, derived subject-first accessible naming, and explicit density warnings.
- Carbon's toggletip is a press-triggered surface that explicitly permits interactive content, quick in-context editing, and filter panels. Focus initially stays on the trigger; Tab enters interactive descendants when present; Tab from the last descendant closes and continues; and the relationship is expressed with `aria-expanded` and `aria-controls`.
- React Spectrum's Contextual Help instead presents a structured, titled dialog-style surface and permits richer content, including an optional link. It is evidence for a different, internally consistent pattern rather than proof that all press-triggered help is a dialog.
- Primer's Popover component is only a positioned visual container, but its usage guidance is prescriptive: move focus inside, provide Escape and visible dismissal for informational content, restore focus on close, avoid trapping focus, and keep the surface after its trigger in DOM order.
- Bootstrap 5's popover implementation inherits tooltip-like relationships even when the content is interactive. Upstream work improves individual behaviors, including Escape dismissal, but does not supply PrairieLearn's content taxonomy or migrate existing callsites for us.
- The native Popover API supplies display, top-layer, and light-dismiss mechanics but no content role or complete focus policy.
- Product guidance from GOV.UK, Fluent, USWDS, Atlassian, and Linear reinforces keeping important explanations visible, using disclosure for longer optional content, and reserving transient overlays for genuinely secondary information. Atlassian's component taxonomy also separates non-actionable tooltips from popups, panels, drawers, and modal dialogs rather than treating every floating surface as one widget.

This disagreement is why the plan standardizes user needs and content limits first, while making contextual-help focus behavior an evidence gate. Copying one design system's component name without its DOM, focus, content, and product assumptions would repeat the original mistake.

Repository validation rules out a text-only contextual-help assumption. PrairieLearn's instructor-preview Tools help contains three links, and PrairieTest has 24 `IconWithPopover` callsites, including table and settings help with documentation links and a linked-assessment list containing an arbitrary number of links. PrairieTest also has roughly 130 shared `InlineEdit`/`CustomInlineEdit` callsites and 20 direct programmatic Bootstrap popover constructors, ranging from single-field editors to multi-field forms and a proctor-assignment table. Those are concrete requirements for separate help, preview/navigation, and anchored-task contracts, not hypothetical future consumers.

Tooltip timing also has no cross-system standard: Bootstrap defaults to immediate display, Material UI defaults to 100 ms, Primer offers 50/400/1200 ms presets, and React Aria defaults to a 1500 ms warmup with a 500 ms close delay. PrairieLearn will start with a shared 500 ms initial hover delay, immediate keyboard-focus display, and a 500 ms close delay. This is an explicit product choice to reduce incidental flashes without making intentionally requested help sluggish; pointer persistence must come from validated geometry rather than this timer, and the timing must be evaluated manually before the tooltip foundations are finalized.

Preserve React Aria's cross-tooltip warmup behavior within the React implementation: after one tooltip opens, another React tooltip entered during the cooldown opens immediately. Give vanilla tooltips the same initial-delay and cooldown behavior within the vanilla implementation. Sharing warmup state across React and vanilla would require additional cross-runtime infrastructure for little user value and is out of scope; mixed-runtime pages must not rely on whether activity in one implementation accelerates the other.

## Design principles

### Prefer no overlay

Use clearer visible copy before adding an overlay. Required instructions, prerequisites, constraints, consequences, errors, and remediation must normally remain visible. An abundance of nearby help icons is evidence that the base interface needs better information architecture.

### Touch availability follows importance

Tooltip content may be unavailable on touch only when the underlying control remains understandable to sighted touch users without it. An accessible name alone does not make an unfamiliar icon understandable to a sighted touch user. Use a visible label, a familiar platform convention, or a press-accessible pattern when text is needed to identify the action. Information needed to understand or complete a task must use visible text, a disclosure, contextual help, or another press-accessible pattern.

### Appearance does not determine semantics

Bootstrap’s `.tooltip` and `.popover` classes may style several patterns, but neither class determines role, focus movement, dismissal, or content constraints. A press event also does not imply `role="dialog"`.

### Avoid generic application-facing overlay APIs

`Tooltip`, `ContextualHelp`, `DialogPopover`, menus, and status components should own their contracts. A low-level positioned overlay may exist internally, but ordinary callsites should not choose raw roles and focus behavior ad hoc.

### Keep content and trigger names aligned

Icon-only controls should derive their accessible name and visual label tooltip from the same required string without exposing that same string again as a duplicate accessible description. Contextual-help triggers should use a subject-first name, such as “Relative cost, more information,” rather than generic or repetitive action-first names. Visible text in an actionable control must remain part of its accessible name for voice control.

## Pattern contracts

### `Tooltip`

Use a tooltip only for concise, nonessential, noninteractive information attached to an existing interactive control. Do not make static text, a status badge, or a table cell focusable solely to show a tooltip.

Appropriate content:

- A visual label for an icon-only action whose meaning remains reasonably understandable to sighted touch users.
- A keyboard shortcut accompanying an action when the shortcut is also discoverable from a durable menu, command palette, or shortcut reference. Expose the shortcut separately with `aria-keyshortcuts` where applicable rather than folding it into the control's accessible name.
- A full value when text inside an existing interactive link or control is truncated and the full value is itself nonessential; a tooltip must not be the only complete text alternative.
- A short, nonredundant description that supplements an existing visible control label.

Inappropriate content:

- Required instructions or validation.
- A prerequisite or reason an action is unavailable.
- Consequential behavior the user must understand before acting.
- Links, buttons, forms, headings, or arbitrary React nodes.
- Any information whose absence on touch prevents understanding or completion.

Behavior:

- Opens on hover after a short delay and immediately on keyboard focus.
- Does not open from touch-generated compatibility events.
- Remains open while the pointer is over the trigger or tooltip. Touching geometry, a non-occluding safe area, or another validated persistence technique must let a slow pointer cross between them; successful entry must not depend only on a timer, and invisible hit regions must not steal hover or activation from adjacent controls.
- Closes on Escape without moving focus, and closes after the configured delay when neither the trigger nor tooltip is hovered and the trigger no longer contains keyboard focus.
- Contains plain text only and never receives focus.
- In label mode, visually exposes the control’s existing accessible name without adding the same string again as an accessible description.
- In description mode, uses `role="tooltip"` and associates nonredundant text with the trigger through `aria-describedby` while appropriate.
- Uses the existing Bootstrap visual treatment in both React and vanilla implementations.
- Never consumes the first tap or prevents the control’s primary action on touch.

API direction:

- Public `Tooltip` is reserved for a nonredundant description of an already named interactive control.
- Visual-label tooltips are owned by an `IconButton` abstraction. `IconButton` accepts one required label and uses that same stable string for the accessible name and optional visual tooltip so the strings cannot drift or be announced twice.
- Icon links and other non-button actions are not forced through `IconButton` or the description-only `Tooltip`; give them a visible label or wait for a purpose-specific label-tooltip abstraction with the same stable-name contract.
- Both surfaces accept plain strings only. The React tooltip foundation must prove one description callsite and one icon-label callsite before broader migration.
- React label mode keeps the trigger's accessible name present whether the visual popup is closed or open, excludes the visual popup from the accessibility tree, and never adds a duplicate `aria-describedby`. React description mode uses an explicit nonredundant string and must prove the dynamically attached relationship is announced reliably before broader migration.
- Vanilla markup uses an explicit relationship such as `data-pl-tooltip-mode="label"` or `"description"`; it does not infer semantics from `textContent`, `aria-label`, or the absence of a name. Unannotated legacy tooltips may retain compatibility inference during migration but are not considered compliant until classified.

### `ContextualHelp`

Use contextual help for brief, optional, local explanatory content that must be available through press/tap. The trigger exists solely to reveal supplemental factual context and uses a consistent information-circle button. As a PrairieLearn convention, reserve question-mark iconography for broader task help or support rather than claiming this distinction is universal across design systems.

Content constraints:

- Brief static prose with limited inline formatting. One or two short sentences remains the default; a compact list is acceptable only when prose would be less clear.
- Related navigational links are permitted and must participate in the normal tab order. Prefer one specifically named documentation link, as Fluent recommends, but allow a deliberately small list when the use case genuinely requires it. An unbounded entity list, such as PrairieTest's linked-assessment list, is an inline-expansion, preview, or navigation-surface problem rather than contextual help.
- No forms, state-changing buttons, editable controls, menus, or application actions. Those make the surface an anchored task, not contextual help.
- No required instructions, validation, errors, or action outcomes.
- Never render contextual-help triggers per table row or cell.
- More than two or three contextual-help triggers in one compact table, card, or form area is a strong signal to consolidate or expose the information visibly; even fewer may be inappropriate when they create repeated tab stops.

Proposed semantics:

- The trigger is a button with a subject-specific accessible name.
- The trigger exposes `aria-expanded` and `aria-controls` while controlling the help content.
- Do not use `aria-haspopup="dialog"` unless the content is actually a dialog.
- The content is not a tooltip and does not use `role="tooltip"`.
- The content does not declare `role="dialog"` merely because it is visually floating.

Proposed behavior:

- Pressing or tapping toggles the content.
- Escape and outside press close it.
- Opening it leaves focus on the trigger and does not trap focus or make the rest of the page inert.
- If the content has a link, Tab from the trigger moves into the first link. If it has no focusable content, Tab closes it and moves to the next page control. Tab from the final link closes it and continues in page order; Shift+Tab provides the corresponding reverse path.
- Escape from inside the content closes it and restores focus to the trigger. Focus-leave or outside-pointer dismissal must not move focus backward from the user's chosen destination.
- It defaults to a roughly 40–48 CSS pixel hit target. The WCAG 2.2 AA floor of 24 by 24 CSS pixels is reserved for an explicit compact-density context with adequate spacing, not treated as the preferred touch size.
- It uses Bootstrap popover styling, but the selected prototype determines DOM placement and behavior.

The exact focus and announcement model is a prerequisite research gate. Production implementation does not begin until one model is selected and recorded:

1. Prototype a Carbon-style toggletip as the leading interaction candidate. Test both text-only content and content with one or more links: focus stays on the trigger, Tab enters links when present, Tab from the final link closes and continues, and `aria-expanded`/`aria-controls` express the relationship.
2. Prototype a Fluent InfoLabel-style inline surface: the content is immediately after the subject/trigger in DOM and accessibility reading order, focus initially stays on the trigger, Tab moves through any links or to the next page control and closes the surface, and screen-reader browse/reading navigation can encounter the revealed content.
3. Prototype Primer's prescribed informational popover: focus moves to the content container, a visible close control is present, Tab proceeds out without wrapping, and closing restores focus only when doing so does not override the user's new destination.
4. Compare all three with the current React Spectrum-style titled dialog behavior.
5. For every prototype, record whether Tab/Shift+Tab closes it, whether a visible close control exists, how Escape behaves when focus is on the trigger/content/elsewhere, whether outside-pointer dismissal preserves the newly selected pointer target, and exactly when focus is restored. Also test clipping, stacking contexts, collision/flip behavior, and 200%/400% zoom for any adjacent-DOM positioning model.
6. Manually test current VoiceOver/Safari and NVDA/Chrome versions, recording versions and relevant verbosity settings. Cover announcement on open, browse-mode discoverability, Tab/Shift+Tab, Escape, and repeated help buttons.
7. Before selecting the touch-oriented pattern, test physical iOS Safari with VoiceOver and Android Chrome with TalkBack. Record spoken output, DOM focus, virtual-cursor location, expanded-state announcement, swipe/browse discoverability, trigger-toggle and outside dismissal, and the post-dismissal cursor/focus destination.
8. Select one behavior and document its DOM-placement constraints. `aria-expanded` and `aria-controls` alone must not be assumed to announce newly revealed text reliably.
9. Define the selected contract independently of either runtime, then implement and validate it in both React and vanilla against real callsites. The feature is not the application-wide standard until both paths satisfy the same contract; the instructor-preview Tools help makes vanilla a first-class validation case rather than a later port.

Every candidate must pass on every tested platform: opening and dismissal cannot lose DOM focus or strand the virtual cursor; the trigger's purpose and expanded state must be perceivable; revealed content must be reachable through the platform's normal reading/browse navigation; and Escape, outside press, Tab, and Shift+Tab must follow the documented destination rules. If no candidate satisfies those minimums across the required desktop and physical-mobile matrix, do not ship `ContextualHelp`; use visible helper text or a disclosure instead of choosing the least-bad average result.

Provisional preference is now the Carbon/Fluent shared model—focus remains on the trigger, links enter ordinary sequential navigation, and the surface closes when focus leaves—because it covers the actual PrairieLearn and PrairieTest help cases without treating them as dialogs. Carbon provides the clearest explicit keyboard contract, while Fluent provides the better content, naming, density, and “documentation link only” constraints. Testing still determines whether the combined contract works across supported platforms.

Provisional API:

```tsx
<ContextualHelp
  subject="Relative cost"
  body="Relative cost is compared with the default model using typical token usage."
  links={[{ href: '/docs/ai-grading', label: 'About AI grading costs' }]}
/>
```

The component should own its icon button and derive a subject-first name such as “Relative cost, more information.” Prefer a structured body-plus-links API over arbitrary children so callers cannot quietly turn contextual help into a form, action menu, or unbounded navigation list. One specifically named documentation link is the default; before fixing a maximum, prototype the common one-link case and existing richer exceptions. The instructor-preview Tools help currently has three links; either consolidate it to one specifically named documentation destination and surface feedback elsewhere, or preserve a deliberately small link list only if testing shows the richer help remains usable.

### `DialogPopover` and purpose-specific inline editors

Anchored tasks are no longer hypothetical. PrairieTest's shared `InlineEdit` family alone has roughly 130 callsites, and PrairieLearn has forms for editing question points, uploading/renaming files, and similar quick tasks in popovers. The reusable foundation may be called `DialogPopover`, but application code should normally consume a purpose-specific surface such as `InlineEditPopover` so save, cancel, dirty-state, and validation behavior do not vary by callsite.

An anchored dialog is appropriate for a small in-context task with a few controls, explicit completion and cancellation, no multi-step flow, and no information that must be compared across a large area. Carbon explicitly lists quick in-context editing as a toggletip use case, but that does not settle modality. The installed React Aria `Popover` deliberately contains focus and hides outside content from assistive technology by default, and PrairieTest's current global behavior already traps keyboard focus in interactive popovers. React Aria warns that its `isNonModal` escape hatch can harm the screen-reader experience. The default editor contract should therefore preserve contained focus rather than invent Tab-away cancellation; nonmodal behavior is reserved for a separately proven immediate-apply or autosave interaction. This does not make every existing PrairieTest popover appropriate: the multi-field override editor, large proctor-assignment table, and other spacious or consequential workflows should be evaluated for a full modal, side panel, inline edit region, or dedicated page. High-impact, irreversible, multi-step, densely validated, or spacious work does not belong in an anchored editor.

Requirements:

- Uses `role="dialog"` for a form or task and requires an accessible title. If the implementation presents it modally, it must also make outside content unavailable to keyboard and assistive-technology navigation; setting `aria-modal` without implementing that behavior is forbidden. React Aria currently implements modal accessibility by hiding outside content rather than setting `aria-modal` because of a documented Safari bug.
- Contains at least one visible dismissal control. A clearly labeled Cancel button satisfies this requirement; compact editors do not need a redundant X.
- Moves focus into the dialog on open.
- Contains focus while open. Tab and Shift+Tab wrap within the task rather than silently canceling edits.
- Closes on Escape and explicit Cancel/close. The controller owns one dirty-dismissal policy across callsites: an outside press is consumed and cancels a pristine editor without activating the underlying target; after any user-caused value mutation—including partial or invalid input—the editor is sticky-dirty and outside press is consumed but ignored. Dirty state clears only after an explicit reset to the initial values or successful submission. Escape and the visible dismissal control remain explicit discard paths. A future standardized confirmation may replace the ignored dirty outside press, but individual callsites must not invent divergent behavior.
- Explicit dismissal with Escape or Cancel/close returns focus to the trigger when it still exists. Successful submission follows the destination implied by the update; if HTMX replaces the trigger, focus moves to an intentional stable target rather than a detached element.
- Must not close an enclosing modal or a different overlay when handling Escape.
- Must render inside the nearest modal or overlay root when nested. Bootstrap's own documentation calls this out because a body-level popover inside a modal can become unreachable to the modal's focus management.
- Must render owned secondary overlays, such as PrairieTest's Flatpickr calendar, inside the dialog's overlay root rather than merely special-casing their pointer events. This keeps them inside focus containment and the assistive-technology boundary. Escape dismisses only the topmost owned overlay first; a subsequent Escape may dismiss the editor.
- Must replace Bootstrap's generated `role="tooltip"` and trigger `aria-describedby` relationship with a stable dialog id and the selected trigger/dialog relationship before changing the attributes used to locate the generated container.
- Must not be used for menus, listboxes, tooltips, status, or read-only one-sentence help.

The anchored editor is visually a popover but behaviorally a contained task dialog. That distinction avoids both accidental Tab-away cancellation and a persistent nonmodal dialog stranded elsewhere in the page. It also aligns the React path with React Aria's supported default and makes the vanilla requirement concrete: Bootstrap provides positioning and appearance, while PrairieLearn's controller must supply the dialog name and relationship, focus entry and containment, dirty dismissal, topmost Escape handling, restoration, modal accessibility boundary, nearest-modal container, and structural nested-widget ownership. A true nonmodal editor remains possible only for a demonstrated immediate-apply or autosave workflow with a documented way to return between the editor and page.

Use React Aria's ordinary `DialogTrigger`/`Popover`/`Dialog` behavior as the starting point for React anchored tasks rather than setting `isNonModal` and fighting its focus model. The component still needs an application contract for title, Save/Cancel, dirty dismissal, nested overlays, and post-submit focus. For HTMX updates, successful submit suppresses ordinary trigger restoration and the caller supplies a stable key or success-focus resolver. After a swap, resolve and move focus at `htmx:afterSettle`; after a successful no-swap or out-of-band-only response, resolve it on the no-swap terminal path after HTMX has completed its DOM work; a full navigation or redirect delegates focus to the destination document. Focus goes first to the target returned by the success resolver, then to the still-connected trigger if resolution yields nothing, and finally to a separately supplied stable workflow fallback. A detached trigger is never focused, and a workflow in which both the trigger can disappear and resolution can fail must provide that stable fallback or fail in development. The vanilla Bootstrap implementation is the immediate concrete requirement and must not wait for a React abstraction.

### Inline help and disclosures

Use visible helper text for information most users need, especially form constraints and consequences. Associate it with the relevant control using `aria-describedby`.

Use a disclosure or native `<details>` when optional content is longer than contextual help, applies to a whole region, or is useful while interacting with several controls. The summary must provide information scent, such as “How rubric scoring works,” rather than “Learn more.” The revealed region may contain ordinary links and controls because it remains in normal DOM and focus order; this does not turn it into an overlay or dialog. If it contains editable state, collapsing must preserve that state or explicitly prevent/confirm destructive collapse, and the summary should expose important hidden state such as a selected-item count.

Do not place `<details>` inside a field label, between a label and its control, or around required field guidance. In forms it works best as a separate section-level troubleshooting or explanation block, or as an explicit grouping mechanism for a large optional set of controls. Existing evidence includes PrairieLearn's “Why don't I see my assignment here?” disclosure after the LTI assignment choices, its collapsed ambiguous/unmatched-student lists in the Canvas matching workflow, and its assessment-set disclosures containing checkbox groups. Proposed uses include a full-width “How rubric scoring works” disclosure above or below the rubric field group and a PrairieTest “How session eligibility is determined” disclosure above the available-sessions table, replacing repeated explanations of capacity, time, and label rules. PrairieTest's webhook-delivery `<details>` is also a good non-form precedent for large optional diagnostics; its unbounded linked-assessment list could be an in-flow list or disclosure rather than contextual help. The instructor-preview Tools help is not a good disclosure candidate if expanding it would distort the narrow sidebar; a compact press-accessible help surface remains more appropriate there.

### Status and feedback

Use a pre-mounted, stable live-region node for brief action results such as “Copied.” The visible feedback may be transient; the node must exist before its text changes. Do not move focus or expose the message as a tooltip/dialog. Use `role="alert"` only for urgent information requiring immediate attention. Errors that block progress must also remain visible at the point of failure.

Visible feedback may accompany the live announcement. For example, a copy icon may temporarily change to a checkmark or adjacent text may briefly say “Copied,” while the control's accessible name remains stable and the live region supplies the announcement. Do not repurpose a tooltip as transient status.

Treat each action completion as an event rather than deriving announcement updates only from a long-lived boolean visual state. Repeating the same action before the prior visual state resets, or activating a second control with the same result, must take one application-owned live-region update path per completion without duplicating the message through another surface. Browsers and assistive technologies may coalesce rapid identical updates, so exact delivery under an artificial burst is not an application guarantee.

Choose feedback by scope:

| Scope                                         | Pattern                                                                            |
| --------------------------------------------- | ---------------------------------------------------------------------------------- |
| One field/control                             | Adjacent validation or local status, programmatically associated where appropriate |
| One card/section                              | Persistent inline message                                                          |
| Whole page or workflow                        | Banner/message bar                                                                 |
| Brief, recoverable, safe-to-miss confirmation | Toast whose own status/live-region semantics supply the announcement               |
| Background progress users may need to revisit | Persistent status surface, not an ephemeral toast                                  |

### Unavailable actions

Choose based on the cause; these are branches, not a priority order:

- **Known, actionable prerequisite:** Keep the reason and remedy visible near the affected control or section. A separately named help/remediation action may open more detail, but the unavailable action itself does not become an explanation button.
- **Availability cannot be known until the server evaluates it, or a safe attempt is the clearest route to remediation:** Keep the action enabled and report validation/remediation from the attempted action.
- **Self-evident, non-remediable, or brief busy state:** Use a native-disabled control. Show visible progress for busy work that is not effectively instantaneous.
- **Irrelevant in the current context:** Hide the action when its absence does not conceal a path the user could meaningfully take.
- **Unauthorized:** Decide whether the action is requestable or configurable. Keep requestable/configurable capabilities discoverable with visible permission guidance; hide capabilities that are irrelevant or unsafe to disclose. “Unauthorized” alone does not decide visibility.
- **Reason cannot fit locally after the interface is simplified:** Consider a separately named “Why unavailable?” control. Do not claim that this explanation control is itself disabled.

For this work, do not invent one-off `aria-disabled` popover behavior. If a future focusable unavailable-action component is independently justified, it must prevent the normal action through click, keyboard, and form-submission paths, preserve its visible accessible name, and point to already-visible explanatory text. It must not unexpectedly change meaning from “perform action” to “explain failure.”

Do not attach tooltips to native-disabled controls. Do not add focusable wrappers around disabled controls by default.

### Legacy/redundant native `title`

Do not use `title` as PrairieLearn’s tooltip implementation or add it to controls. It may remain or be added only as a strictly redundant pointer enhancement when the same meaning is already visible and available to keyboard, touch, and assistive-technology users. A relative `<time>` value may use `title` for an exact timestamp only when that precision is genuinely optional; otherwise provide an explicit visible or press-accessible route to the exact value.

## React architecture

- Keep React Aria as the interaction foundation; do not add a second component system.
- Reimplement the useful React Aria ideas from `master` rather than carrying forward the abandoned branch wholesale. Public `Tooltip` is description-only and accepts plain text rather than arbitrary `ReactNode`; `IconButton` owns a separate visual-only label surface. Both use a deliberate shared hover delay rather than `delay={0}`. Start with 500 ms unless manual testing demonstrates a better value, while keyboard focus opens immediately.
- React Aria's installed tooltip implementation observes hover on the trigger, not on the rendered tooltip. Add explicit tooltip-hover handling plus a validated trigger-to-tooltip persistence path—touching geometry, a non-occluding hit-testable safe area, or an equivalent technique—so the content remains available during deliberately slow transit and while parked over it without stealing interaction from adjacent controls.
- Application code should use purpose-specific components. Do not revive the abandoned branch's generic public `Popover`. Retain the pre-existing public `OverlayTrigger`; auditing or replacing that established API is separate work.
- Do not ship `ContextualHelp` until the focus/announcement gate is resolved. In the installed React Aria version, `DialogTrigger` supplies press behavior plus `aria-expanded` and conditional `aria-controls`; it does not itself emit `aria-haspopup="dialog"`. It is still not a ready-made Fluent/Carbon candidate because the associated popover/dialog composition brings portaling, dismissal, hidden-dismiss-button, and focus-containment behavior that must not be inherited accidentally.
- If the selected `ContextualHelp` model uses a positioned overlay, build it from controlled state and an owned button trigger with semantics supplied explicitly. Do not assume React Aria `Popover isNonModal` is a ready-made Carbon-style disclosure: in the installed version it portals to `body`, changes outside-dismiss behavior, and supplies hidden dismiss controls. If DOM adjacency or ordinary sequential navigation is required, use a lower-level overlay/positioning foundation and keep the content in the required local DOM position.
- Do not add `DialogPopover` to either tooltip foundation. The PrairieTest inline editors now establish a concrete follow-up, but the implementation must first classify simple versus oversized editors and solve nearest-overlay-root behavior.
- Use existing React Aria or React Bootstrap menu/listbox/modal components rather than expressing those widgets through either new primitive.
- Until a nearest-overlay-root solution exists, contextual help and anchored dialogs inside Bootstrap modals must become inline help/disclosures, render within the modal, or remain out of scope rather than being portaled to `body`.

## Vanilla architecture

Bootstrap is a permanent browser integration surface for PrairieLearn question content. First-party elements, third-party elements, and course-authored questions will continue to use declarative markup and vanilla JavaScript even if the administrative application becomes predominantly React. This is already substantial first-party surface area: 17 element Mustache templates contain 49 declarative popover triggers, and element JavaScript also constructs popovers programmatically. `@prairielearn/ui` should therefore own durable Bootstrap behavior adapters; only individual version-specific workarounds are transitional.

The following terms are a migration glossary and proposed long-term semantic modes, not a set of public modes that the initial vanilla tooltip foundation must implement:

| Term              | Meaning                                                                                                                                                                                                           |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `legacy-auto`     | Permanent backwards-compatible fallback matching historical behavior for unannotated existing, third-party, and course-authored popovers; new first-party markup must not request it                              |
| `status-visual`   | Narrow name for the existing clipboard-only visual feedback exception, currently marked with `data-pl-popover-mode="status"` and backed by a live region                                                          |
| `contextual-help` | Future Carbon/Fluent-style press disclosure for supplemental prose and links, matching the validated React contract                                                                                               |
| `dialog`          | Future contained-focus anchored form/task with explicit dialog naming, completion, cancellation, modal accessibility boundary, and restoration behavior; the intended basis for simple PrairieTest inline editors |

Compatibility rules:

- Replacement work starts from `master`, so unannotated existing or course-authored `data-bs-toggle="popover"` markup retains its historical semantics and focus policy. Do not reintroduce the abandoned branch's universal dialog ARIA. Preserving master semantics does not require preserving a demonstrated nested-overlay bug.
- Retain a capture-phase Escape fix so dismissing the open legacy popover inside a Bootstrap modal does not also dismiss the modal on the same key press. If focus was inside an interactive popover, restore it to the connected trigger after `hidden.bs.popover`; do not override a new destination after outside-pointer dismissal. Focus-triggered read-only popovers already retain focus on their trigger. Verify both variants inside a modal.
- Do not reinterpret `legacy-auto` as a description or a new sanctioned dialog primitive. It remains supported for backwards compatibility, while first-party callsites migrate over time to explicit help, dialog, menu, modal, inline expansion, or status contracts. Known categories include rich-text-editor controls, administrator management, file browsing, personal notes, editing question points, and assessment-instance actions.
- Programmatically created instances are a permanent requirement, not an edge case: PrairieTest currently has 20 direct Bootstrap popover constructors and PrairieLearn elements also construct instances. New programmatic code must supply an explicit semantic mode through a stable registration/factory API rather than forcing the behavior layer to inspect Bootstrap's private `_config`; legacy detection may continue for compatibility.
- Direct `new bootstrap.Tooltip(...)` and `new bootstrap.Popover(...)` calls in existing first-party, third-party, and course-authored scripts must continue to receive the `legacy-auto` compatibility baseline through delegated Bootstrap lifecycle handling. The explicit factory/registration API is how new programmatic code opts into a stronger label, description, contextual-help, or task-dialog contract; it is not permission to abandon direct-constructor compatibility.
- Controller state is keyed by trigger plus the current Bootstrap instance generation, not by trigger alone. Existing application code may dispose and recreate an instance on the same element, and Bootstrap disposal does not emit `hide`/`hidden`; lifecycle handling must detect replacement, detach stale state, adopt the new current instance where appropriate, and never dispose an externally owned replacement during installer cleanup.
- Focus-triggered legacy popovers remain read-only descriptions and never receive focus or contain interactive content.
- New first-party code must not create a legacy press/focus description popover; use a true tooltip, visible content, or the eventual validated contextual-help component.
- Contextual help must use a real button trigger and explicit mode once that mode exists. The vanilla contract must support links and formatting as well as plain text, but reject or reclassify forms and state-changing controls.
- The existing clipboard behavior may retain `data-pl-popover-mode="status"` in a standalone correctness fix. Do not generalize or rename it merely to match this glossary. Keep a private inserted-popover exception that removes the trigger's `aria-describedby` and hides the visual bubble from the accessibility tree. The live region must exist before its text update and is the only accessible announcement source.
- Do not build general cross-runtime overlay arbitration incidentally. The tooltip foundations may add one narrowly scoped, per-document tooltip Escape coordinator because concurrent vanilla and React tooltips are an explicit requirement: open tooltip instances register close callbacks, and a window capture listener closes all registered tooltips and consumes that Escape before document-level Bootstrap or React Aria overlay handlers can act. Its registration, ownership, and teardown must be deterministic. Other concurrent/nested Bootstrap and React Aria overlays remain unsupported in this work; define a general topmost-overlay contract only when a demonstrated use case requires it.
- Any future migrated interactive surface must not treat interaction inside itself as an outside press. This statement does not expand the guarantees of quarantined `legacy-auto` behavior.
- Comments referencing upstream Bootstrap issues belong next to the compatibility code they justify and should say when the workaround can be removed.

Long-term vanilla API requirements:

- Declarative question content continues to use stable Bootstrap-shaped markup. The global behavior enhances `data-bs-toggle="tooltip"` plus an explicit `data-pl-tooltip-mode="label|description"`, and eventually enhances `data-bs-toggle="popover"` plus explicit `data-pl-popover-mode="contextual-help|dialog"`. Unannotated markup remains operational through `legacy-auto`.
- Course-authored scripts that need only ordinary tooltip/popover behavior should prefer declarative markup so dynamic insertion is discovered automatically. A small browser-global or otherwise question-runtime-accessible factory is required for programmatic construction because course scripts cannot be assumed to import the monorepo package. Its exact namespace is a design decision, but directly calling `new bootstrap.Tooltip` or `new bootstrap.Popover` cannot be the only documented route to the enhanced contract.
- Explicit vanilla label mode has one continuously available name source: the trigger's required `aria-label`. The adapter renders the current accessible name as the visual label, hides the generated visual popup from the accessibility tree, and removes Bootstrap's duplicate `aria-describedby`; it does not maintain two caller-authored strings that can drift. Dynamic accessible-name changes update an open bubble and future openings. Description mode keeps the independently named trigger and associates its nonredundant tooltip text through `aria-describedby`.
- Delegated lifecycle listeners provide the permanent safety net for existing direct Bootstrap construction; selector observation provides eager initialization and teardown for declarative triggers. Neither path may assume that all content is React-hydrated or package-importing.
- The package-level installers accept Bootstrap constructors from the consuming application rather than bundling a second Bootstrap copy. They are SSR-safe, idempotent per document, support dynamically inserted and removed triggers, and expose deterministic `AbortSignal` or disposer cleanup.
- Version adapters isolate Bootstrap 5 and future Bootstrap 6 DOM, lifecycle, and ARIA differences. Upgrading Bootstrap may delete workarounds such as custom Escape handling or hover retention, but must not delete the PrairieLearn-facing tooltip/help/dialog contracts.
- The same semantic mode produces equivalent naming, relationship, focus, dismissal, touch, and nested-modal behavior in PrairieLearn and PrairieTest. App bundles may still own CSS loading, MathJax/HTMX processing, and application-specific success handling.
- Documentation must separately cover first-party elements, third-party element authors, and course question authors, including safe plain text, rich HTML/DOM content, programmatic creation, teardown, and the fact that tooltips never expose essential content on touch.
- Keep a browser-level compatibility fixture for each supported Bootstrap major that exercises static declarative markup, dynamically inserted markup, a direct programmatic constructor, content inside a Bootstrap modal, teardown, and external dispose/recreation on the same trigger. This protects the permanent authoring surface without unit-testing Bootstrap internals.

The native Popover API is a promising eventual internal substrate for static contextual help because it provides declarative press activation, light dismissal, Escape, top-layer rendering, and implicit relationships. It is not itself a semantic role, and CSS anchor positioning still requires a support-policy decision. Adoption should be a separate follow-up after the current behavior is stable and must preserve the Bootstrap-shaped author contract rather than requiring course content to migrate again.

### PrairieTest adoption contract

Publishing vanilla tooltip behavior from `@prairielearn/ui` can precede PrairieTest adoption, but the package and PR must not claim PrairieTest compatibility until the actual application is verified.

Current PrairieTest evidence (September 2026) makes this a real migration, not a hypothetical consumer check: it uses Bootstrap 5.3.8 and `@prairielearn/ui` 4.x, has its own selector-observer tooltip behavior, mixes tooltip triggers across real controls, `href="#"` icon helpers, and static spans, and has many separate interactive Bootstrap popovers whose tests currently query them as `role="tooltip"`. It also has roughly 130 shared inline-edit callsites and 20 direct programmatic popover constructors. The shared tooltip work must target only genuine tooltip cases. Contextual-help links and simple anchored editors are concrete follow-up consumers; complex programmatic popovers require individual reclassification rather than being silently absorbed into one package behavior.

- Keep Bootstrap injected by the consumer rather than adding a hard package/runtime dependency, and keep module import safe during SSR with no import-time `document` access.
- Document the supported Bootstrap major/minor contract, required tooltip CSS classes, lifecycle events, expected DOM shape, and the Bootstrap 5 assumptions around `aria-describedby`. State separately what can be removed or changed for Bootstrap 6.
- Make installation idempotent within one document and make `AbortSignal` cancellation dispose every owned Bootstrap instance, element listener, and document listener. Verify install/cancel/reinstall.
- In PrairieTest itself, verify its Bootstrap version and styles, SSR/build import, duplicate initialization, dynamic trigger discovery, teardown, and at least one label and description tooltip before announcing support.
- Audit PrairieTest's tooltip triggers by the same label/description/touch/static-content contract before replacing its local behavior. Remove fake interactive anchors and static tooltip triggers rather than merely initializing them through the shared controller.
- Keep PrairieLearn and PrairieTest behavior contracts aligned, but allow app-specific bundle entry points and CSS loading rather than hiding those concerns in the shared behavior.

## Escaping and content security

Prefer safely constructed real DOM/React content over serializing HTML into `data-bs-content`. When Bootstrap accepts a DOM node, pass the node directly rather than serializing and reparsing it, but do not assume Bootstrap sanitizes that node: Bootstrap 5's template factory appends `Element` content directly and bypasses its string sanitizer. DOM content must be constructed through safe DOM/rendering APIs or independently sanitized before Bootstrap receives it. Do not add new first-party rich HTML serialized through this attribute; the following rules govern only TypeScript string-serialization boundaries changed by this work.

Rules for long-lived Bootstrap content:

- Plain-text popovers omit `data-bs-html="true"`. Let the active renderer or DOM API handle attribute transport; do not manually entity-encode a plain string before handing it to React or `setAttribute`.
- Rich popover content serialized from TypeScript through `@prairielearn/html` must be represented as `HtmlSafeString`, never an arbitrary raw string. `HtmlSafeString` records renderer-boundary intent; it is not proof of sanitization because intentionally unsafe constructors exist.
- Construct intended markup with `html` or `renderHtml` so interpolated untrusted values are escaped within the fragment. Then follow the boundary actually in use:
  - In an `html` tagged-template attribute, an interpolated `HtmlSafeString` bypasses the outer renderer's escaping. Call `escapeHtml()` exactly once on the complete fragment before interpolation.
  - In a JSX attribute, pass the rendered fragment's string value and let React perform attribute serialization. Calling `escapeHtml()` first would double-escape it.
  - With `setAttribute`, Bootstrap `setContent`, or a programmatic constructor, pass the intended rendered string; there is no HTML-source attribute parse to compensate for. Do not entity-encode it for transport.
- Do not pre-escape child values, escape a complete fragment twice, or copy a serialization recipe from one renderer boundary to another. Prefer a named helper per surviving boundary rather than one misleading universal helper.
- React content relies on React escaping. `dangerouslySetInnerHTML` is allowed only for an independently sanitized or trusted transformation with an explicit security argument.
- Inventory HTML-mode callsites by trust and serialization boundary. Do not make removal of global `sanitize: false` a foundational-PR requirement: first-party elements, third-party elements, and course-authored content make rich Bootstrap content a long-lived compatibility concern. Prefer safely constructed DOM-node content or Bootstrap-sanitized strings for new APIs where they satisfy the use case; retain deliberately trusted legacy paths with explicit escaping rules. Existing Python/Chevron Mustache, jQuery/programmatic-string, and other non-`@prairielearn/html` paths remain separately tracked unless this work changes them; do not force them through `HtmlSafeString` as incidental cleanup.
- Add a small DOM-level regression for each TypeScript string-serialization boundary changed by this work. Cover intended markup, quotes, ampersands, literal entities, and untrusted text, asserting exact decoded content and the absence of injected elements without re-testing the renderer generally.

## Current branch callsite plan

This table is a design classification, not a mechanical replacement list. Each migration must preserve the original visible information, accessible name, action semantics, and feedback.

| Area                                                                        | Proposed treatment                                                                                                                                                                                                                                            |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Group-role table header explanations                                        | Provide a concise always-visible introduction/legend and reference that text from the table where useful; label a separate “About group roles” disclosure independently rather than making its entire collapsed body the table description                    |
| Rubric settings’ seven help icons                                           | Move consequential field guidance to visible helper text; consolidate general scoring explanation into “How rubric scoring works” disclosure; any isolated contextual help is a future candidate, not part of the tooltip foundations                         |
| AI model relative-cost explanation                                          | Visible caption/legend                                                                                                                                                                                                                                        |
| Grader-assignment permission note inside dropdown                           | Place the description adjacent to the menu trigger or in a correctly marked non-menuitem header/description excluded from item navigation                                                                                                                     |
| Student name/UIN/email unavailable cells                                    | Visible “Pending”/“Available after joining” treatment with one table/column-level explanation; no repeated per-cell tab stops                                                                                                                                 |
| Tree shared tags                                                            | Rename visibly to “Shared tags”; no overlay                                                                                                                                                                                                                   |
| Tree counts and configuration summaries                                     | Use complete inline visible or visually hidden text without new tab stops; a tooltip is allowed only when its owner is already an interactive action and the extra text is nonessential                                                                       |
| Tree status vocabulary                                                      | Use stable icon/text treatment with one visible legend when the vocabulary is not self-evident                                                                                                                                                                |
| Tree warnings and remediation                                               | Put actionable warning detail in the selected item's detail area or another persistent local message; do not hide remediation behind a static icon                                                                                                            |
| Manual-grading issue counts and open-assessment indicators                  | Preserve the compact visible badge/icon and put its complete meaning in ordinary or visually hidden text in reading order; optional native `title` may be a redundant pointer hint; do not turn status into a button                                          |
| Manual-grading AI/human comparison icons                                    | Provide a visible legend or short text labels unless the icons are independently conventional and validated; screen-reader text mirrors visible meaning; no overlay required                                                                                  |
| Rejected enrollment and other dense-table status explanations               | Prefer a column/table legend or nearby visible explanation; an isolated explanation may become a future contextual-help candidate, but the tooltip foundations must not introduce a per-cell help button                                                      |
| Exact relative dates                                                        | Audit each use of shared `FriendlyDate`; render semantic `<time>` everywhere, but allow redundant native `title` only where exact precision is genuinely nonessential and provide a visible or press-accessible exact route for audit-sensitive timestamps    |
| Copy confirmation                                                           | Visual “Copied” state plus one stable polite live-region update path per completed action, including repeated or cross-control copies; do not add a duplicate tooltip description or promise exact AT delivery under rapid bursts                             |
| Synchronization error/warning logs                                          | Prefer a side panel or dedicated log view for unbounded output reused in dense tables; use a modal only when inspection is intentionally exclusive and table comparison is unnecessary, and inline `<details>` only after evaluating row growth               |
| Locked assessment navigation                                                | Show the blocking condition and actionable remediation visibly near the action or progress indicator—for example, link to the overview that can cross the lockpoint; do not hide required progression rules in a popover                                      |
| Missing API-key and permission prerequisites                                | Visible remediation or an already-explained disabled control; do not invent per-callsite unavailable-action popovers                                                                                                                                          |
| Reorder/delete/save/label/copy actions with known unavailable reasons       | Keep the action normally disabled when appropriate and place actionable prerequisites near the affected control or section; do not make an unavailable action pressable merely to open its explanation                                                        |
| Statuses already conveyed by visible text, such as “Queued” or “Open”       | No overlay unless it adds genuinely useful optional detail                                                                                                                                                                                                    |
| Existing Reset variants and Finalize action explanations                    | Preserve them as description tooltips only if the controls remain understandable on touch and the copy is genuinely supplementary; otherwise move the consequence into visible supporting or confirmation copy                                                |
| Raw HTML editor explanation                                                 | Syntax or accepted-input requirements are persistent helper text; optional conceptual background may be a later contextual-help candidate                                                                                                                     |
| Instructor-preview Tools help                                               | Contextual-help validation case with links. Consolidate the current per-assessment, per-zone, and feedback destinations if one specifically named docs link can preserve the use case; otherwise test a small link list rather than forcing text-only content |
| PrairieTest settings/table help through `IconWithPopover`                   | Audit 24 callsites by content: keep short explanatory prose and small documentation-link sets press-accessible; move required rules into visible copy; move arbitrary linked-entity lists to inline expansion, preview, or navigation surfaces                |
| PrairieTest typed `InlineEdit` text/number/URL/boolean/select/date controls | Primary vanilla `DialogPopover`/`InlineEditPopover` validation set: contained-focus anchored task, explicit title and Save/Cancel, controller-owned dirty dismissal, nested date-picker handling, and post-HTMX focus behavior                                |
| PrairieTest `CustomInlineEdit` and styling-only `.btn-inline-edit` uses     | Classify individually. Arbitrary custom forms, modal launchers, large widgets, and `onlyCancel` “cannot edit” explanations are not automatically inline editors; the last category should become visible unavailable-action remediation                       |
| PrairieTest multi-field override and proctor-assignment popovers            | Evaluate as modals, side panels, inline regions, or dedicated pages; their size and state exceed the default anchored-editor contract                                                                                                                         |
| Existing popovers containing forms, confirmations, or actions               | Classify individually as menu, modal, inline expansion, or validated anchored dialog; never migrate solely by component name                                                                                                                                  |

## Pull-request and migration sequence

The existing PRs should be closed rather than restacked. Replacement branches start from current `master`, and old commits are consulted only as implementation references. This removes the need for a rollback PR and prevents the rejected generic `Popover`, universal dialog conversion, and broad callsite redesigns from becoming the base of otherwise valid tooltip work.

The detailed delivery sequence, proof consumers, real-browser strategy, PrairieTest package-release dependency, and rollback boundaries live in the [overlay implementation plan](./implementation-plan.md). Its high-level order is:

1. Revalidate and extract any independent correctness fixes from the abandoned branches.
2. Land the permanent vanilla Bootstrap tooltip foundation.
3. Build the React `Tooltip` and `IconButton` foundation from the resulting `master`.
4. Migrate callsites in small semantic batches while preserving `OverlayTrigger` compatibility.
5. Run contextual-help research in parallel and ship it only if one model passes the physical-device and assistive-technology gate.
6. Prototype representative PrairieTest editors before extracting shared dialog behavior and migrating only the typed editor family.

Do not publish unresolved contracts in `@prairielearn/ui` documentation. Each public package change receives its own changeset and proof consumers, and PrairieTest production work consumes a published package version rather than a committed local dependency or permanent copied controller.

## Verification strategy

Automated coverage should remain small and behavior-focused.

Component-level contracts apply only to components actually shipped in a given PR:

- Tooltip opens immediately from keyboard focus and after the configured mouse-hover delay, remains open while the pointer is parked over its content beyond the close delay, ignores touch, and closes on Escape or final focus loss.
- A deliberately slow pointer can traverse the trigger-to-tooltip path without losing the tooltip, including with a large pointer and at 200%/400% zoom; the 500 ms close delay is not the sole compliance mechanism, and the persistence geometry does not interfere with adjacent targets.
- Label-mode controls have the same computed accessible name while the visual tooltip is closed, open, and dismissed, with no duplicate description. Description mode has the intended computed description and actual VoiceOver/NVDA output on first focus, repeated focus, and focus after Escape.
- Tooltip exit animation can be interrupted by renewed trigger/tooltip activity without losing the requested open state.
- Uninstalling and reinstalling vanilla tooltip behavior leaves no stale instances or global listeners.
- Explicit vanilla label mode exposes one stable accessible name, keeps its visual label synchronized under dynamic updates, hides the generated bubble from the accessibility tree, and never adds a duplicate description.
- Externally disposing and recreating a Bootstrap tooltip on the same trigger leaves no stale registry entry or listeners, and installer teardown never disposes the externally owned replacement.
- Escape can close concurrently open vanilla and React tooltips without closing an enclosing modal on the same key press.
- A future contextual-help component opens by press/tap, exposes its selected relationship, leaves initial focus on the trigger, makes any links reachable in logical order, follows the validated announcement model, and closes without trapping focus.
- An anchored editor moves focus inside, replaces Bootstrap's tooltip semantics with a correctly named task dialog, contains keyboard and assistive-technology navigation while open, provides visible Save and dismissal controls as applicable, closes the topmost owned overlay on Escape, follows the controller-owned pristine/dirty outside-dismiss rule, and restores focus after explicit cancellation when the trigger still exists.
- Flatpickr and other owned secondary overlays render within the task dialog's overlay root and participate in its focus and assistive-technology boundary. A successful HTMX submit follows the defined success-target precedence after swap/settle, after a no-swap or out-of-band-only response has completed its DOM work, and delegates focus to the destination document after navigation or redirect; it never restores focus to a detached trigger.
- Status completions take one application-owned update path through a stable polite live region without moving focus or creating a duplicate source. Manually verify repeated actions and two controls at a reasonable user cadence without requiring guaranteed AT delivery under an artificial rapid burst.
- Any future unavailable-action component suppresses every normal activation path while keeping visible remediation discoverable.
- Rich legacy vanilla content survives attribute transport without injection or double escaping.
- Escape dismisses a focus-triggered read-only legacy popover or interactive legacy popover inside a Bootstrap modal without dismissing the modal on that same press. The read-only trigger retains focus; after the interactive popover's hidden event, focus is restored to its connected trigger.
- Declarative vanilla tooltip/help/dialog modes work when inserted dynamically, and the programmatic factory/registration path works without importing or bundling a second Bootstrap copy. Uninstall/reinstall leaves no stale instances or listeners.

Manual browser and assistive-technology matrix:

- Chrome and Firefox with keyboard only.
- Safari on macOS with VoiceOver.
- Chrome on Windows with NVDA if available; otherwise arrange a focused external check rather than claiming coverage.
- Sighted coarse-pointer testing on iOS Safari and Android Chrome, including whether icon-only actions are understandable and remain one-tap operable.
- iOS Safari with VoiceOver and Android Chrome with TalkBack for any shipped contextual-help or unavailable-action pattern.
- Browser zoom at 200% and 400%, including reflow and overlay collision.
- Reduced motion for tooltip/popover transitions.
- Basic voice-control verification for visible-label/accessibility-name alignment.
- Bootstrap modal/dropdown and repeated-control cases only for a component whose PR claims to support them.
- Representative first-party element, third-party/course-style declarative markup, and programmatic PrairieTest cases for every vanilla contract the PR claims to support.

Automated accessibility scans are supplemental and cannot decide focus behavior or announcement quality.

Use one announcement source for each status update. If the visible toast or local status surface has suitable live-region semantics, do not also send the same message to a separate live region. Use a separate pre-mounted live region only when the visual feedback surface is intentionally not announced.

## Acceptance criteria

- No new or migrated first-party rule maps every press-triggered popover to `role="dialog"` or a focus trap; quarantined legacy behavior remains only where migration has not yet happened.
- Every callsite whose interaction or content presentation is migrated is classified by user need in review, not merely by its previous component. A security-only serialization correction may leave legacy presentation quarantined when the debt is explicitly tracked.
- Essential content at migrated callsites is visible in the page flow at the point of need; merely making it available through press is not sufficient. Global compatibility fixes such as nested-overlay Escape handling do not implicitly authorize or require repository-wide callsite redesign.
- True tooltip content is optional, concise, plain text, and noninteractive.
- `IconButton` owns visual label tooltips and their continuously available accessible names; public `Tooltip` supplies only nonredundant descriptions. Vanilla callsites declare the same relationship explicitly before they are considered migrated.
- Tooltip pointer persistence works across the physical trigger-to-popup path and is not justified solely by a close timer.
- If contextual help is shipped, it works on touch and does not make the rest of the page inert.
- If interactive anchored content is shipped, it has a title, close mechanism, predictable focus entry/exit, and correct nested-overlay behavior.
- React and vanilla implementations satisfy the same interaction and content contract across supported input modes.
- Bootstrap-backed behavior remains a supported authoring path rather than a temporary migration shim; upgrades may replace internal workarounds without changing the documented PrairieLearn contract.
- Contextual-help triggers are never repeated per table row/cell. Tooltips never introduce a focusable wrapper or tab stop for static table content; existing repeated icon-action buttons may have label tooltips when they satisfy the tooltip and touch contracts.
- Disclosures in forms are section-level optional explanation or troubleshooting, not substitutes for field labels, required instructions, validation, or remediation.
- No changed feature loses meaning, accessible naming, action feedback, or an equivalent discoverable path.
- Plain and rich content at serialization boundaries changed by this work follows the documented escaping rules; untouched Python/Mustache, jQuery/programmatic, and direct-DOM paths remain outside this criterion unless explicitly migrated.
- The tooltip foundation documentation describes only the shipped description `Tooltip`, label-tooltip `IconButton`, and vanilla contracts, and gives examples of information that must not be hidden in tooltips. `ContextualHelp` documentation is added only if that component ships after the research gate.
- Targeted tests, typechecking, linting, formatting, manual browser checks, and CI pass for each PR before dependent production work begins.

## Decision gates and open questions

1. Does the Carbon/Fluent contextual-help model pass actual desktop and physical-mobile screen-reader testing for plain text, one link, and a small link list, and what DOM placement does it require?
2. Should the React contextual-help API permit only one structured documentation link, a small structured list, or constrained static `ReactNode` content? Which existing Tools/PrairieTest cases genuinely need more than one link?
3. For simple anchored editors, does contained focus with explicit Save/Cancel work well across representative table, settings, Flatpickr, and HTMX cases? Is there any demonstrated immediate-apply or autosave editor that justifies a separate nonmodal contract?
4. Which PrairieTest editor families fit the anchored contract, and which must move to a modal, panel, inline region, or page? Has nearest-modal/overlay-root support landed first?
5. Before the vanilla tooltip foundation documentation freezes, what exact name and signature should the required declarative/programmatic browser API use for course-authored scripts without a bundler, and how is it versioned alongside the package installer?
6. Is there any concrete unavailable-action case that visible remediation or safe validation cannot solve?
7. Which rich HTML Bootstrap popovers remain after first-party callsite reclassification, and what sanitizer/escaping contract applies separately to first-party, third-party-element, and course-authored content?
8. Does PrairieLearn’s supported-browser policy permit the native Popover API as a later internal substrate without changing the Bootstrap-shaped author contract?
9. Which existing components are canonical for field validation, section/page messages, and toast/live-region feedback?

## Review record

The original plan was iterated through independent accessibility, product/UX, implementation, and adversarial architecture reviews. A clean-room panel covering accessibility, product behavior/copy, and cross-runtime architecture gave unqualified approval on September 16, 2026.

Subsequent repository validation found material evidence that the reviewed plan had under-modeled interactive help, PrairieTest inline editors, form-adjacent disclosures, and permanent Bootstrap consumers. The plan was revised, reviewed again by separate contextual-help, anchored-editor, and vanilla-compatibility reviewers, and then subjected to fresh clean-room accessibility/UX and architecture reviews. After two final wording corrections to the dirty-dismissal and HTMX focus-recovery contracts, both final reviewers gave unqualified approval on September 16, 2026. This consensus approves the design, not unimplemented production behavior: contextual help and the editor follow-up remain gated by the stated prototype and assistive-technology validation. The later implementation plan supersedes the original stacked-PR sequence without changing these product contracts.

## Research basis

- [WAI-ARIA tooltip pattern](https://www.w3.org/WAI/ARIA/apg/patterns/tooltip/)
- [WAI-ARIA disclosure pattern](https://www.w3.org/WAI/ARIA/apg/patterns/disclosure/)
- [WAI-ARIA modal dialog pattern](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/)
- [MDN ARIA dialog role, including nonmodal dialogs](https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Reference/Roles/dialog_role)
- [WAI-ARIA naming and description guidance](https://www.w3.org/WAI/ARIA/apg/practices/names-and-descriptions/)
- [WCAG content on hover or focus](https://www.w3.org/WAI/WCAG22/Understanding/content-on-hover-or-focus.html)
- [Carbon toggletip accessibility](https://preview.carbondesignsystem.com/building-blocks/core/components/toggletip/accessibility)
- [Carbon toggletip usage](https://carbondesignsystem.com/components/toggletip/usage/)
- [React Spectrum Contextual Help](https://react-spectrum.adobe.com/v3/ContextualHelp.html)
- [React Aria Popover](https://react-aria.adobe.com/Popover)
- [React Aria Tooltip](https://react-aria.adobe.com/Tooltip)
- [Primer tooltip accessibility](https://primer.style/product/components/tooltip/accessibility/)
- [Primer tooltip guidelines and alternatives](https://primer.style/product/components/tooltip/guidelines/)
- [Primer popover accessibility](https://primer.style/product/components/popover/accessibility/)
- [Primer button accessibility and inactive buttons](https://primer.style/product/components/button/accessibility/)
- [Fluent InfoLabel](https://fluent2.microsoft.design/components/web/react/core/infolabel/usage)
- [Fluent Field](https://fluent2.microsoft.design/components/web/react/core/field/usage)
- [Material UI tooltip](https://mui.com/material-ui/react-tooltip/)
- [USWDS tooltip](https://designsystem.digital.gov/components/tooltip/)
- [USWDS tooltip accessibility tests](https://designsystem.digital.gov/components/tooltip/accessibility-tests/)
- [GOV.UK details](https://design-system.service.gov.uk/components/details/)
- [Nielsen Norman Group tooltip guidelines](https://www.nngroup.com/articles/tooltip-guidelines/)
- [Inclusive Components: tooltips and toggletips](https://inclusive-components.design/tooltips-toggletips/)
- [Bootstrap popover accessibility](https://getbootstrap.com/docs/5.3/components/popovers/#accessibility)
- [Bootstrap tooltip hover-retention issue](https://github.com/twbs/bootstrap/issues/42065)
- [Bootstrap tooltip hover-retention pull request](https://github.com/twbs/bootstrap/pull/35151)
- [Bootstrap 6 Escape-dismissal pull request](https://github.com/twbs/bootstrap/pull/42472)
- [Bootstrap popover dialog-semantics discussion](https://github.com/twbs/bootstrap/issues/28446)
- [Bootstrap popover description-semantics pull request](https://github.com/twbs/bootstrap/pull/38978)
- [MDN Popover API](https://developer.mozilla.org/en-US/docs/Web/API/Popover_API)
- [MDN tooltip role and native `title` limitations](https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Reference/Roles/tooltip_role)
- [WCAG 2.2 target size minimum](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html)
- [ARIA live-region status technique](https://www.w3.org/WAI/WCAG21/Techniques/aria/ARIA22)
- [Linear invisible details](https://linear.app/now/invisible-details)
- [Linear Peek](https://linear.app/docs/peek)
- [Atlassian component taxonomy](https://atlassian.design/components)
