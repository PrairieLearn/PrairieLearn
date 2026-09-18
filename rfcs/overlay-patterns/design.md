# Overlay interaction patterns plan

Status: proposed. The abandoned [contextual-popover PR](https://github.com/PrairieLearn/PrairieLearn/pull/15552) and [tooltip PR](https://github.com/PrairieLearn/PrairieLearn/pull/15549) remain useful references, but cleanup starts from `master` and follows the [implementation plan](./implementation-plan.md).

This RFC provides a rubric for removing and classifying overlays in PrairieLearn and PrairieTest. Its replacement components remain provisional until the cleanup identifies what must survive.

## Executive decision

“Tooltip” and “popover” describe appearance, not behavior. Start by asking whether the overlay is needed at all. If it is, choose a pattern based on what the user needs; treat positioning and Bootstrap styling as implementation details.

The working taxonomy is:

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
| Navigate among related entities or inspect a bounded related-item list                                 | Inline links/list, disclosure, or dedicated view                     |
| Inspect rich read-only details, long logs, or compare information                                      | Inline expansion or dedicated view                                   |
| Require an exclusive decision or blocking task                                                         | Modal dialog                                                         |

Do not treat every press-triggered popover as a focus-trapped dialog.

Use this taxonomy first to remove overlays whose information belongs in the page. Do not treat every row as a commitment to build a new component. Public APIs will be chosen after every remaining first-party use has been reviewed and justified.

Use this decision path before adding an overlay:

1. Is the information required to understand, complete, or recover from the task? Keep it visible as helper text, validation, or a message.
2. Is it a short visual label, shortcut, or nonredundant description of an existing interactive control? Use a tooltip.
3. Is it a short optional explanation with at most a few links and no state-changing controls? Use contextual help after its interaction model is validated.
4. Is it longer but still optional? Use a disclosure or `<details>`. If it must remain available while the user works elsewhere, use a panel or dedicated view.
5. Does it contain choices or controls? Use a menu or listbox for actions and selection. Use an anchored dialog only for a small task with explicit completion and cancellation. Use a modal or page for larger, multi-step, or consequential work.
6. Is it action feedback or system state? Choose a local status, validation message, section/page message, or toast based on scope and urgency.
7. Is the intent to navigate related entities or inspect rich detail? Use an inline list, disclosure, or dedicated view rather than stretching tooltip or contextual help.

## Goals

- Provide a small, predictable set of patterns that works with mouse, keyboard, touch, screen readers, magnification, and voice control.
- Keep React and vanilla implementations of the same pattern behaviorally equivalent.
- Preserve Bootstrap styling and support both Bootstrap 5 and future Bootstrap 6 integrations.
- Use React Aria where its behavior matches the chosen pattern.
- Treat vanilla Bootstrap as a permanent compatibility surface for first-party elements, third-party elements, and course content.
- Keep essential information visible, reserve focus containment for real dialogs, and avoid duplicate announcements or extra tab stops.
- Define safe rules for rich Bootstrap content.
- Reduce first-party overlays to a reviewed set of genuine use cases before designing replacement APIs.

## Non-goals

- Replacing Bootstrap, React Bootstrap, or React Aria across the application.
- Introducing Radix, Base UI, Floating UI, or another competing overlay stack.
- Rebuilding every menu, modal, dropdown, date picker, select, and combobox.
- Converting overlays to the native Popover API.
- Eliminating third-party, element-owned, or course-authored Bootstrap overlays before compatibility work can land.
- Designing hover cards, side sheets, coachmarks, or tours; the audit found no current need for them.
- Treating administrator-only interfaces as exempt from accessibility and interaction-quality requirements.

## Research synthesis

The reviewed design systems agree that content and purpose should determine the pattern, but they do not define one universal popover:

- WAI-ARIA describes tooltips as noninteractive text shown on hover or focus and dismissed with Escape. WCAG 1.4.13 also requires hoverable content to stay open while the pointer is over it.
- Primer separates label and description tooltips, limits them to plain text, and warns that tooltip content may be unavailable on touch or missed by screen-reader users.
- React Aria also omits tooltips on touch. Its tooltip primitive watches hover on the trigger, so PrairieLearn must add and test pointer persistence over the tooltip itself.
- Fluent InfoLabel and Carbon toggletip are the closest models for contextual help: a pressable info button, optional links, no focus trap, and ordinary sequential navigation.
- React Spectrum uses a richer dialog-style contextual-help pattern. Primer also recommends moving focus into informational popovers. These are valid patterns, but they are not appropriate for every help button.
- Bootstrap 5 gives popovers tooltip-like semantics even when they contain interactive content. Bootstrap improvements do not replace an application-level content taxonomy.
- The native Popover API does not provide semantics or a complete focus policy, and its January 2025 baseline is too recent for this work.
- GOV.UK, Fluent, USWDS, Atlassian, and Linear all favor visible important guidance, disclosures for longer optional content, and overlays only for secondary information.

The RFC therefore defines content limits before implementation details. Cleanup comes first; contextual help requires a prototype only if justified uses remain.

The repository audit found real uses for several separate patterns. PrairieLearn's instructor-preview Tools help has three links. PrairieTest has 26 `IconWithPopover` callsites, about 130 `InlineEdit`/`CustomInlineEdit` callsites, and 20 direct Bootstrap popover constructors. Some are short help, some are navigation, and some are forms. The audit found no current need for hover cards, coachmarks, or tours.

Tooltip timing varies widely across design systems. For tooltips that survive, PrairieLearn will start with a 500 ms hover delay, immediate display on keyboard focus, and a 500 ms close delay. Pointer persistence must come from traversable geometry, not just the close timer.

Keep React Aria's warmup behavior: after one tooltip opens, nearby tooltips open immediately for a short time. Vanilla tooltips should behave the same within their own runtime. React and vanilla do not need shared warmup state.

## Design principles

### Prefer no overlay

Prefer visible copy. Required instructions, constraints, consequences, errors, and remediation should not be hidden behind an icon.

### Touch availability follows importance

A tooltip may be unavailable on touch only when the control remains understandable without it. An accessible name does not help a sighted touch user interpret an unfamiliar icon. Use a visible label or press-accessible pattern when text is needed.

### Appearance does not determine semantics

Bootstrap’s `.tooltip` and `.popover` classes may style several patterns, but neither class determines role, focus movement, dismissal, or content constraints. A press event also does not imply `role="dialog"`.

### Avoid generic application-facing overlay APIs

Public components should own their semantics and focus behavior. Keep any low-level positioning primitive internal.

### Keep content and trigger names aligned

Icon-only controls should derive their accessible name and visual label tooltip from the same required string without exposing that same string again as a duplicate accessible description. Contextual-help triggers should use a subject-first name, such as “Relative cost, more information,” rather than generic or repetitive action-first names. Visible text in an actionable control must remain part of its accessible name for voice control.

## Provisional pattern contracts

These contracts describe how surviving use cases would behave. They do not authorize a replacement component or migration before the cleanup and survivor review are complete.

### `Tooltip`

Use a tooltip only for concise, nonessential, noninteractive information attached to an existing interactive control. Do not make static text, a status badge, or a table cell focusable solely to show a tooltip.

Static status indicators must make sense without hover or focus. For example, show a triangle and visible “Open” text instead of a bare warning icon. A conventional issue-count badge may keep only the number visible, with its full meaning in normal or visually hidden text. If a badge shares a destination with an adjacent link, include it in that link rather than creating another control.

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
- Remains open over both the trigger and tooltip. A slow pointer must be able to cross the gap without relying only on a timer, and any safe area must not block adjacent controls.
- Closes on Escape without moving focus, and closes after the configured delay when neither the trigger nor tooltip is hovered and the trigger no longer contains keyboard focus.
- Contains plain text only and never receives focus.
- In label mode, visually exposes the control’s existing accessible name without adding the same string again as an accessible description.
- In description mode, uses `role="tooltip"` and associates nonredundant text with the trigger through `aria-describedby` while appropriate.
- Uses the existing Bootstrap visual treatment in both React and vanilla implementations.
- Never consumes the first tap or prevents the control’s primary action on touch.

API direction:

- Public `Tooltip` is reserved for a nonredundant description of an already named interactive control.
- `IconButton` owns visual-label tooltips. Its required `label` supplies both the accessible name and visual text.
- Do not force icon links and other non-button actions through `IconButton` or the description-only `Tooltip`. Give them a visible label, or add a component designed for that action with the same stable-name contract.
- Both surfaces accept plain strings only.
- React label mode keeps the accessible name on the trigger and hides the visual bubble from the accessibility tree. Description mode adds one nonredundant `aria-describedby` relationship.
- Vanilla authoring remains ordinary Bootstrap markup and constructors. The shared behavior infers label or description treatment when the trigger's naming makes that clear and falls back to compatible legacy behavior when it does not. Course and third-party content must not need PrairieLearn-specific attributes or a browser API.

### `ContextualHelp`

Use contextual help for a brief optional explanation that must work on touch. Its trigger is an information-circle button named for its subject. Reserve question-mark icons for broader task help or support within PrairieLearn.

Content constraints:

- Brief prose with limited formatting. One or two sentences is the default; use a short list only when it is clearer.
- Links follow normal tab order. Prefer one named documentation link, but allow a small set when needed. Use an inline list, disclosure, or dedicated view for unbounded lists.
- No forms, state-changing buttons, editable controls, menus, or application actions. Those make the surface an anchored task, not contextual help.
- No required instructions, validation, errors, or action outcomes.
- Do not repeat contextual-help triggers per table row or cell. Several help buttons in one compact area are a sign that the content should be consolidated or made visible.

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
- Tab follows document order through any links, then closes the help. With no links, Tab closes it and moves to the next control. Shift+Tab mirrors this behavior.
- Escape from inside restores focus to the trigger. Focus-leave and outside-press dismissal preserve the user's new focus target.
- The default hit target is about 40–48 CSS pixels. Use the 24-by-24 WCAG minimum only in a compact layout with enough spacing.
- It uses Bootstrap popover styling, but its DOM placement must preserve the documented sequential focus order.

If justified help cases survive, the leading model combines Carbon's toggletip interaction with Fluent's content and naming guidance: focus stays on the trigger, links join normal tab order, and the help closes when focus leaves. Before publishing a component, test a private prototype with the actual surviving content, including its richest link set and any repeated compact layout. Cover keyboard behavior, outside press, screen-reader discovery, collision, and zoom on representative desktop and mobile setups.

Do not assume that `aria-expanded` and `aria-controls` make revealed text discoverable. If the prototype loses focus, strands the virtual cursor, or hides content from normal reading navigation, use visible help or a disclosure instead. React and vanilla implementations must pass the same contract. The instructor-preview Tools help is one candidate only if it survives page-level review.

Proposed API:

```tsx
<ContextualHelp subject="Relative cost">
  <p>Relative cost is compared with the default model using typical token usage.</p>
  <a href="/docs/ai-grading">About AI grading costs</a>
</ContextualHelp>
```

The component owns its icon button and derives a name such as “Relative cost, more information.” It accepts `ReactNode` because valid help may contain formatting and links. Types cannot prevent inappropriate controls, so documentation and review must enforce the content rules.

### `DialogPopover` and purpose-specific inline editors

PrairieTest has about 130 `InlineEdit` callsites, and PrairieLearn also uses popovers for small editing tasks. The shared primitive may be called `DialogPopover`, but application code should normally use a purpose-specific component such as `InlineEditPopover` so save, cancel, dirty-state, and validation behavior stay consistent.

Use an anchored dialog for a small task with a few controls, explicit completion and cancellation, and no multi-step flow. React Aria contains focus in popovers by default, and PrairieTest already traps focus in interactive popovers. The audit found no immediate-save editor that needs a nonmodal variant: the typed and custom editors use explicit Save/Cancel or another explicit action, while the four `onlyCancel` cases are explanations rather than editors. Larger forms, irreversible work, and tasks that require comparing information elsewhere belong in a modal, panel, inline region, or page.

Requirements:

- Uses `role="dialog"` and has an accessible title. If it behaves modally, outside content must be unavailable to keyboard and assistive-technology navigation. Do not set `aria-modal` without implementing that behavior.
- Contains at least one visible dismissal control. A clearly labeled Cancel button satisfies this requirement; compact editors do not need a redundant X.
- Moves focus into the dialog on open.
- Contains focus while open. Tab and Shift+Tab wrap within the task rather than silently canceling edits.
- Closes on Escape and explicit Cancel/close. An outside press closes a pristine editor without activating the underlying target. Once the user changes a value, outside press is ignored until the values are reset or saved. Callsites must not invent their own dirty-dismissal rules.
- Explicit dismissal with Escape or Cancel/close returns focus to the trigger when it still exists. Successful submission follows the destination implied by the update; if HTMX replaces the trigger, focus moves to an intentional stable target rather than a detached element.
- Must not close an enclosing modal or a different overlay when handling Escape.
- Must render inside the nearest modal or overlay root when nested. Bootstrap's own documentation calls this out because a body-level popover inside a modal can become unreachable to the modal's focus management.
- Renders owned overlays, such as Flatpickr, inside the dialog's overlay root. Escape closes the topmost owned overlay first.
- Must replace Bootstrap's generated `role="tooltip"` and trigger `aria-describedby` relationship with a stable dialog id and the selected trigger/dialog relationship before changing the attributes used to locate the generated container.
- Must not be used for menus, listboxes, tooltips, status, or read-only one-sentence help.

The editor looks like a popover but behaves as a contained task dialog. Bootstrap supplies positioning and appearance; PrairieLearn supplies dialog semantics, focus containment, dismissal, restoration, nesting, and dirty-state behavior. Design a nonmodal variant only if a real immediate-save workflow needs one.

Start React anchored tasks with React Aria's normal `DialogTrigger`/`Popover`/`Dialog` behavior, not `isNonModal`. For HTMX submissions, the caller provides a success-focus resolver. Resolve focus after `htmx:afterSettle` for swaps and after DOM work completes for no-swap or out-of-band responses; navigation leaves focus to the destination document. Prefer the resolved target, then a still-connected trigger, then a required workflow fallback. Never focus a detached trigger. The vanilla Bootstrap implementation can ship before a React abstraction.

### Inline help and disclosures

Use visible helper text for information most users need, especially form constraints and consequences. Associate it with the relevant control using `aria-describedby`.

Use a disclosure or `<details>` when optional content is longer than contextual help, applies to a region, or should remain available while the user works. Use a specific summary such as “How rubric scoring works,” not “Learn more.” A disclosure stays in normal DOM and focus order, so it may contain links and controls. If it contains editable state, collapsing must preserve that state or warn before discarding it.

Do not put `<details>` inside a field label, between a label and its control, or around required guidance. In forms, use it for section-level explanation, troubleshooting, or a large optional group. Existing examples include LTI assignment help, Canvas student-matching lists, assessment-set checkbox groups, and PrairieTest webhook diagnostics. Possible uses include rubric-scoring help and session-eligibility rules. The instructor-preview Tools help remains a better fit for contextual help because the sidebar is narrow.

### Status and feedback

Use a pre-mounted live region for brief results such as “Copied.” It must exist before its text changes. Do not move focus or present status as a tooltip or dialog. Reserve `role="alert"` for urgent messages, and keep blocking errors visible at the point of failure.

Visible feedback may accompany the announcement: a copy icon can change to a checkmark or nearby text can say “Copied.” Keep the control's accessible name stable.

Send each completed action through one application-owned announcement path, including repeated actions and the same action from different controls. Do not announce the same result from both a tooltip and a live region. Browsers may coalesce rapid identical updates; exact delivery during an artificial burst is not required.

Choose feedback by scope:

| Scope                                         | Pattern                                                                            |
| --------------------------------------------- | ---------------------------------------------------------------------------------- |
| One field/control                             | Adjacent validation or local status, programmatically associated where appropriate |
| One card/section                              | Persistent inline message                                                          |
| Whole page or workflow                        | Banner/message bar                                                                 |
| Brief, recoverable, safe-to-miss confirmation | Toast whose own status/live-region semantics supply the announcement               |
| Background progress users may need to revisit | Persistent status surface, not an ephemeral toast                                  |

### Unavailable actions

Choose based on the cause:

- **Known, actionable prerequisite:** Keep the reason and remedy visible near the affected control or section. A separately named help/remediation action may open more detail, but the unavailable action itself does not become an explanation button.
- **The server must decide, or trying is the clearest route to remediation:** Keep the action enabled and report the result from the attempted action.
- **Self-evident, non-remediable, or brief busy state:** Use a native-disabled control. Show visible progress for busy work that is not effectively instantaneous.
- **Irrelevant in the current context:** Hide the action when doing so does not conceal a meaningful path.
- **Unauthorized:** Keep requestable or configurable capabilities visible with permission guidance. Hide capabilities that are irrelevant or unsafe to disclose.
- **Reason cannot fit locally after the interface is simplified:** Consider a separately named “Why unavailable?” control. Do not claim that this explanation control is itself disabled.

The audit found no need for a shared unavailable-action popover. Save restrictions belong in validation, reorder/delete restrictions in visible row or section state, PrairieTest's `onlyCancel` explanations in visible notes, and access-control prerequisites in adjacent messages. Do not make an unavailable action pressable merely to explain itself.

Do not attach tooltips to native-disabled controls. Do not add focusable wrappers around disabled controls by default.

### Legacy/redundant native `title`

Do not use `title` as PrairieLearn’s tooltip implementation or add it to controls. It may remain or be added only as a redundant pointer enhancement when the same meaning is already visible and available to keyboard, touch, and assistive-technology users. A relative `<time>` value may use `title` for an exact timestamp only when the exact value is optional; otherwise provide a visible or press-accessible way to get it.

## React architecture

Build this architecture only for the React use cases that survive the cleanup. The names below are design directions, not approved public APIs.

- Keep React Aria as the interaction foundation; do not add another component system.
- Reimplement the useful tooltip work from `master` instead of carrying the abandoned branch forward. `Tooltip` is a plain-text description; `IconButton` owns visual labels. Both use the shared delay and immediate keyboard behavior.
- React Aria watches hover on the trigger, not the rendered tooltip. Add hover handling and a traversable path without blocking adjacent controls.
- Use purpose-specific public components. Do not revive the generic `Popover`, and keep the existing `OverlayTrigger` during migration.
- Do not build `ContextualHelp` from React Aria's high-level `Popover isNonModal`; it portals to `body` and brings dismissal and focus behavior that do not match the proposed contract. Use controlled state and lower-level positioning if DOM order requires it.
- Keep `DialogPopover` out of the tooltip foundations. First classify PrairieTest editors and solve rendering inside the nearest modal or overlay root.
- Continue using existing menu, listbox, and modal components. Until nested roots are supported, render contextual help and anchored dialogs inside a Bootstrap modal or use inline content instead.

## Vanilla architecture

Bootstrap is a permanent integration surface for question content. First-party elements, third-party elements, and course questions will continue to use declarative markup and vanilla JavaScript. Today, 17 element templates contain 49 popover triggers, and element JavaScript also constructs popovers directly. `@prairielearn/ui` should own the shared behavior; only version-specific workarounds are temporary.

Application-owned vanilla overlays still go through the same removal loop as React uses. Permanent compatibility is not a reason to retain first-party content that should be visible or use another established pattern.

The following terms are an internal migration glossary, not public modes or a second authoring API:

| Term              | Meaning                                                                        |
| ----------------- | ------------------------------------------------------------------------------ |
| `legacy-auto`     | Compatibility behavior for existing, third-party, and course-authored popovers |
| `status-visual`   | Existing clipboard-only visual feedback, backed by a live region               |
| `contextual-help` | Future press-accessible help matching the React contract                       |
| `dialog`          | Future contained-focus task dialog for small PrairieTest editors               |

Compatibility rules:

- Existing and course-authored `data-bs-toggle="popover"` markup keeps its behavior from `master`; do not apply dialog semantics to every popover.
- Escape inside a legacy popover must not also close its Bootstrap modal. Restore focus after keyboard dismissal, but preserve a new target chosen by outside press.
- `legacy-auto` is only a compatibility fallback. New first-party code uses the appropriate help, dialog, menu, modal, inline, or status pattern.
- Direct Bootstrap construction remains supported. Use delegated lifecycle events and `getInstance`, not private `_config`, so first-party, third-party, and course scripts do not need a PrairieLearn API.
- Track both the trigger and current Bootstrap instance. If code disposes and recreates an instance on the same trigger, detach stale state and never dispose the replacement during cleanup.
- Focus-triggered legacy popovers remain read-only descriptions and never receive focus or contain interactive content.
- New first-party code must not create a legacy press/focus description popover; use a true tooltip, visible content, or `ContextualHelp` once that component is validated.
- Contextual help uses a real button and supports text, formatting, and links, but not forms or state-changing controls. Course and third-party content must not need a PrairieLearn browser API.
- The clipboard status exception may keep its private mode. Its live region is the only accessible announcement; hide the visual bubble from the accessibility tree and remove the trigger's `aria-describedby`.
- Add only the cross-runtime coordination needed for Escape to close concurrent React and vanilla tooltips without closing a parent overlay. Do not build a general overlay manager without a real use case.
- Interaction inside a migrated overlay is not an outside press.
- Comments referencing upstream Bootstrap issues belong next to the compatibility code they justify and should say when the workaround can be removed.

Long-term vanilla behavior requirements:

- Keep ordinary Bootstrap markup and constructors as the authoring API. Infer label semantics for an icon-only control whose tooltip matches its accessible name, and description semantics for a visibly named control with distinct tooltip text. Leave ambiguous legacy markup on the compatibility path.
- Label tooltips use the trigger's accessible name as their single source. The visual bubble is hidden from the accessibility tree and does not add a duplicate description. Description tooltips keep the control's name and add one `aria-describedby` relationship.
- Do not expose a browser-global PrairieLearn factory. Add a narrow internal override only if a first-party case cannot use ordinary Bootstrap markup.
- Support declarative and direct-constructor paths through selector observation and delegated lifecycle events. The installer receives Bootstrap from the host, is SSR-safe and idempotent, and cleans up through `AbortSignal` or a disposer.
- Isolate Bootstrap-version differences behind adapters. Bootstrap upgrades may remove workarounds but must preserve the public behavior.
- Keep PrairieLearn and PrairieTest behavior aligned while allowing separate entry points, CSS, MathJax/HTMX hooks, and application-specific success handling.
- Document plain text, rich content, programmatic construction, cleanup, and touch limitations for first-party, third-party, and course authors.
- Maintain a browser fixture for declarative, dynamic, direct-constructor, modal, teardown, and instance-replacement cases on each supported Bootstrap major.

The native Popover API is too new for this work. If it becomes an internal substrate later, ordinary Bootstrap authoring must keep working.

### PrairieTest adoption contract

The package may ship before PrairieTest adopts it, but it must not claim PrairieTest support until the application is tested. PrairieTest uses Bootstrap 5.3.8, `@prairielearn/ui` 4.x, its own tooltip initializer, about 130 inline editors, and 20 direct popover constructors. Migrate only genuine tooltips; classify interactive popovers separately.

- Keep Bootstrap injected by the consumer rather than adding a hard package/runtime dependency, and keep module import safe during SSR with no import-time `document` access.
- Document supported Bootstrap versions, required CSS, lifecycle events, DOM assumptions, and Bootstrap 5-specific workarounds.
- Make installation idempotent within one document and make `AbortSignal` cancellation dispose every owned Bootstrap instance, element listener, and document listener. Verify install/cancel/reinstall.
- In PrairieTest, verify SSR/build import, styling, duplicate installation, dynamic discovery, teardown, and one label and description tooltip.
- Audit PrairieTest's tooltip triggers against the same label, description, touch, and static-content rules before replacing its local behavior. Remove fake interactive anchors and static tooltip triggers instead of initializing them through the shared controller.
- Keep the behavior contract shared, but let each application own its bundle entry point and CSS loading.

## Escaping and content security

Prefer real DOM or React content over HTML strings in `data-bs-content`. Bootstrap appends `Element` content without sanitizing it, so construct nodes through safe APIs or sanitize them first. Do not add new first-party rich HTML attributes; the rules below apply to TypeScript serialization boundaries changed by this work.

Rules for long-lived Bootstrap content:

- Plain-text popovers omit `data-bs-html="true"`. Let the active renderer or DOM API handle attribute transport; do not manually entity-encode a plain string before handing it to React or `setAttribute`.
- Rich popover content serialized from TypeScript through `@prairielearn/html` must be represented as `HtmlSafeString`, never an arbitrary raw string. `HtmlSafeString` records renderer-boundary intent; it is not proof of sanitization because intentionally unsafe constructors exist.
- Construct intended markup with `html` or `renderHtml` so interpolated untrusted values are escaped within the fragment. Then follow the boundary actually in use:
  - In an `html` tagged-template attribute, an interpolated `HtmlSafeString` bypasses the outer renderer's escaping. Call `escapeHtml()` exactly once on the complete fragment before interpolation.
  - In a JSX attribute, pass the rendered fragment's string value and let React perform attribute serialization. Calling `escapeHtml()` first would double-escape it.
  - With `setAttribute`, Bootstrap `setContent`, or a programmatic constructor, pass the intended rendered string; there is no HTML-source attribute parse to compensate for. Do not entity-encode it for transport.
- Do not pre-escape child values, escape a complete fragment twice, or copy a serialization recipe from one renderer boundary to another. Prefer a named helper per surviving boundary rather than one misleading universal helper.
- React content relies on React escaping. `dangerouslySetInnerHTML` is allowed only for an independently sanitized or trusted transformation with an explicit security argument.
- Inventory HTML callsites by trust source and serialization boundary. Do not require global removal of `sanitize: false` in a foundation PR. Prefer safe DOM nodes or Bootstrap-sanitized strings for new code, and document trusted legacy paths. Track Python/Mustache, jQuery/programmatic strings, and other non-`@prairielearn/html` paths separately unless this work changes them.
- Add one DOM-level regression per changed TypeScript serialization boundary. Cover markup, quotes, ampersands, literal entities, and untrusted text without retesting the renderer itself.

## Cleanup backlog

This table is the starting backlog for the removal loop, not a bulk replacement list. Each PR must review the whole page and preserve the information, accessible name, action semantics, and feedback that users rely on.

| Application  | Area                                                       | Likely treatment                                                                                                                        |
| ------------ | ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| PrairieLearn | Group-role table explanations                              | Clearer headers and one visible introduction; remove the five tooltips and the single-purpose `HelpTooltip` component                   |
| PrairieLearn | Required modules and referenced assessment sets            | Omit unavailable delete actions and show visible “Required” or “Used by N assessments” state                                            |
| PrairieLearn | Locked question navigation                                 | Use a disabled action and show the restriction nearby                                                                                   |
| PrairieLearn | Student access schedules                                   | Use a native disclosure containing the schedule table                                                                                   |
| PrairieLearn | Zone scoring and points explanations                       | Put the scoring rule in a visible zone summary or table description                                                                     |
| PrairieLearn | Rubric settings help                                       | Put field requirements beside their controls and consolidate general guidance under “How rubric scoring works”                          |
| PrairieLearn | AI model relative cost                                     | Use a visible caption or legend                                                                                                         |
| PrairieLearn | Grader-assignment permission note                          | Put the note beside the menu trigger or in a non-item menu description                                                                  |
| PrairieLearn | Unavailable student name, UIN, and email                   | Show visible “Pending” or “Available after joining” text                                                                                |
| PrairieLearn | Assessment tree labels, counts, and warnings               | Use clear visible names, compact text, and a legend; put actionable details in the selected item's detail area                          |
| PrairieLearn | Manual-grading issue and open-assessment badges            | Keep issue counts as static number badges and show a triangle with visible “Open” text                                                  |
| PrairieLearn | Manual-grading AI/human comparison                         | Use visible column labels and remove per-checkbox tooltips                                                                              |
| PrairieLearn | Other static warnings and count badges                     | Prefer self-explanatory text such as “Ignored,” “Not counted,” or “N to grade”                                                          |
| PrairieLearn | AI credit balance definitions                              | Put short definitions inside the balance cards                                                                                          |
| PrairieLearn | Relative dates                                             | Render `<time>`; use native `title` only when the exact value is optional                                                               |
| PrairieLearn | Copy confirmation                                          | Show a visible “Copied” state and send one polite live-region update per action                                                         |
| PrairieLearn | Synchronization logs                                       | Use a panel or dedicated log view for unbounded output; use a modal only when inspection should block other work                        |
| PrairieLearn | Other locked or unavailable actions                        | Show the reason and remedy near the action; do not turn the unavailable action into an explanation button                               |
| PrairieLearn | Reset and Finalize explanations                            | Keep a description tooltip only if it is optional and the control remains clear on touch; otherwise use supporting or confirmation copy |
| PrairieLearn | Raw HTML editor explanation                                | Keep syntax requirements visible; reconsider optional conceptual help only after cleanup                                                |
| PrairieLearn | Instructor-preview Tools help                              | Retain as a contextual-help candidate only if visible help or disclosure is worse after page-level review                               |
| PrairieTest  | Friendly dates and ranges                                  | Use semantic time markup and a redundant native `title`, without Bootstrap                                                              |
| PrairieTest  | Paper-exam indicators                                      | Use visible “Paper” or “Paper reservations” badges                                                                                      |
| PrairieTest  | Reservation-extension mismatches                           | Show the mismatch and expected value visibly                                                                                            |
| PrairieTest  | Invite statuses                                            | Remove explanations that restate visible status; move real workflow guidance above the table                                            |
| PrairieTest  | Student session availability and location descriptions     | Put slot definitions and location descriptions in the page                                                                              |
| PrairieTest  | Table-header help                                          | Use a table caption, card introduction, or section-level disclosure                                                                     |
| PrairieTest  | Prediction errors and minimap legends                      | Use an inline warning and native disclosure                                                                                             |
| PrairieTest  | Other `IconWithPopover` uses                               | Move requirements into visible copy and entity lists into the page; retain only justified optional contextual help                      |
| PrairieTest  | Typed `InlineEdit` controls                                | Keep as anchored-dialog candidates after non-editor `onlyCancel` cases are removed                                                      |
| PrairieTest  | Custom and large editor popovers                           | Classify each as an anchored dialog, modal, panel, inline region, page, or visible explanation                                          |
| Both         | Other popovers containing forms, confirmations, or actions | Classify by purpose; do not preserve the old component merely because the content already floats                                        |

## Pull-request and migration sequence

Close the existing implementation PRs rather than restacking them. Start cleanup and replacement branches from current `master` and consult old commits only for specific implementation details.

The [implementation plan](./implementation-plan.md) contains the detailed sequence. At a high level:

1. Establish complete PrairieLearn and PrairieTest inventories, including indirect helpers, native `title`, direct constructors, elements, and generated markup.
2. Repeatedly remove unnecessary overlays in small, independent PRs. Recount and reclassify the inventory after each family.
3. Stop only when every remaining first-party overlay has a written justification and no simpler visible or established pattern fits.
4. Revisit this taxonomy against the survivors and remove proposed components with no clear use cases.
5. Build the permanent vanilla tooltip foundation, then the React foundation, using actual survivors as their first callsites.
6. Migrate only the surviving genuine tooltips.
7. Prototype contextual help and PrairieTest anchored editors only if the survivor inventory still requires them.

The removal loop may extract an independent correctness fix when it still reproduces and remains relevant after reclassification. It should not repair machinery for an overlay that can be deleted instead.

Document only shipped contracts. Each public package change needs a changeset and representative application callsites. PrairieTest production code must consume a published package version.

## Verification strategy

For cleanup PRs:

- Capture the same representative page before and after the change.
- Confirm that all previous information remains visible or has a clear, intentional path.
- Check keyboard order, touch-size implications, alignment, wrapping, zoom, and responsive layout when affected.
- Confirm that removing the overlay also removes artificial tab stops, duplicate descriptions, and obsolete initialization code.
- Add automated coverage only when the PR changes behavior owned by the application; do not test the absence of Bootstrap plumbing for its own sake.
- Update the inventory and record any newly discovered related uses.

For foundation PRs, keep automated coverage small and test only contracts shipped by that PR:

- Tooltips honor delay, focus, pointer persistence, touch suppression, Escape, and interrupted exit transitions.
- Label tooltips preserve one accessible name; description tooltips add one nonredundant description.
- Vanilla installation, abort, reinstallation, dynamic markup, direct constructors, and external instance replacement leave no stale state.
- One Escape closes concurrent React and vanilla tooltips without closing a parent modal.
- Contextual help, if shipped, follows the validated focus, reading-order, and dismissal contract.
- Anchored dialogs handle focus containment, dirty dismissal, nested overlays, HTMX replacement, and focus restoration.
- Status updates use one live-region path, and changed rich-content boundaries do not inject or double-escape HTML.
- A legacy popover inside a Bootstrap modal closes without also closing the modal.

Manual browser and assistive-technology matrix:

- Chrome and Firefox with keyboard only.
- Safari on macOS with VoiceOver.
- Chrome on Windows with NVDA where available; otherwise arrange a focused external check.
- Sighted coarse-pointer testing on iOS Safari and Android Chrome, including whether icon-only actions are understandable and remain one-tap operable.
- For contextual help, at least one physical mobile screen reader plus sighted checks on iOS Safari and Android Chrome. Expand when results differ by platform.
- Browser zoom at 200% and 400%, including reflow and overlay collision.
- Reduced motion for tooltip/popover transitions.
- Basic voice-control verification for visible-label/accessibility-name alignment.
- Bootstrap modal, dropdown, and repeated-control cases only when the component claims to support them.
- Representative first-party element, third-party/course-style declarative markup, and programmatic PrairieTest cases for every vanilla contract the PR claims to support.

Automated accessibility scans are supplemental; they cannot verify focus behavior or spoken output. Use one announcement source for each status update.

## Acceptance criteria

- Every first-party tooltip and popover in PrairieLearn and PrairieTest has been reviewed by user need, including indirect shared helpers and programmatic construction.
- No static element is focusable solely to expose a tooltip, and no status depends on hover or focus for its meaning.
- No essential instruction, prerequisite, consequence, validation message, or remediation exists only in an overlay.
- No unavailable action is made pressable solely to explain why it is unavailable.
- No first-party popover remains when visible content, disclosure, an established widget, or a dedicated view is clearly better.
- New code does not treat every press-triggered popover as a dialog or focus trap.
- Each remaining and migrated callsite is classified by user need, not by its old component name.
- Essential content is visible at the point of need.
- True tooltip content is optional, concise, plain text, and noninteractive.
- If the proposed React tooltip APIs ship, `IconButton` owns visual labels and stable accessible names while public `Tooltip` supplies only nonredundant descriptions. Vanilla provides the same distinction when ordinary Bootstrap markup makes it clear.
- A pointer can move between trigger and tooltip without relying only on a close timer.
- If contextual help is shipped, it works on touch and does not make the rest of the page inert.
- If interactive anchored content is shipped, it has a title, close mechanism, predictable focus entry/exit, and correct nested-overlay behavior.
- React and vanilla implementations satisfy the same interaction and content contract across supported input modes.
- Bootstrap remains a supported authoring path; upgrades may replace workarounds without changing the contract.
- Contextual-help triggers are not repeated per table row or cell. Tooltips do not add focusable wrappers or tab stops to static content.
- Disclosures in forms are section-level optional explanation or troubleshooting, not substitutes for field labels, required instructions, validation, or remediation.
- Changed features keep their meaning, accessible name, feedback, and discoverable path.
- Changed serialization boundaries follow the documented escaping rules.
- Documentation covers only shipped contracts and explains what must not be hidden in tooltips.
- Each cleanup PR is independently deployable and includes proportional browser verification before the next related batch expands.
- Replacement foundations are designed from the justified survivor inventory, not from the abandoned implementations.

## Decision gates and open questions

1. Has every first-party overlay been reviewed, and does each survivor have a written reason that visible content, disclosure, or an established widget is worse?
2. Which surviving controls require visual-label tooltips, and which require nonredundant description tooltips, in React and vanilla?
3. Do any surviving help cases justify a shared `ContextualHelp` component? If so, does its prototype work with the actual content on representative desktop and mobile screen readers?
4. Which PrairieTest editor families fit the anchored-dialog contract, and which must move to a modal, panel, inline region, or page?
5. Does the vanilla prototype find a first-party case whose label or description semantics cannot be inferred from ordinary Bootstrap markup? If so, what narrow internal override does it need?

## Review record

The plan went through accessibility, product, UX, and architecture review. A later repository audit found missing requirements for linked contextual help, PrairieTest inline editors, form disclosures, and permanent Bootstrap consumers. The first small cleanup PRs then showed that many apparent component migrations were better solved by deleting the overlay, so the sequence was revised to complete that work before replacement design. Contextual help and anchored editors still require the prototypes and assistive-technology checks described above if justified survivors remain.

## Research basis

- [WAI-ARIA tooltip pattern](https://www.w3.org/WAI/ARIA/apg/patterns/tooltip/)
- [WAI-ARIA disclosure pattern](https://www.w3.org/WAI/ARIA/apg/patterns/disclosure/)
- [WAI-ARIA modal dialog pattern](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/)
- [MDN ARIA dialog role](https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Reference/Roles/dialog_role)
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
