---
shaping: true
---

# Generalized graph-based fast sync — Shaping

## Source

From DM thread (Peter ↔ Nathan), 2026-06-04, re: [PR #12461](https://github.com/PrairieLearn/PrairieLearn/pull/12461):

> **Peter:** One implementation note I was thinking about would be to model this problem with a generic DAG structure. If done this way, a lot of the "out-of-the-box" algorithms for figuring out dependencies and required files to resync "fall out".
>
> **Peter:** Model each file/object to sync as a node in a graph, and each one of these dependencies as a directed edge. Then, if a file changes, mark the affected node in the graph and do a graph traversal to figure out all affected other files you need to sync.
>
> **Nathan:** with an increasingly large number of edits just coming from the UI, the vast majority are going to touch just one relevant file at a time. […] specific is easier than general and gets most of the benefit that we're looking for for users.
>
> **Peter:** why implement N "standard cases" instead of just designing a general solution from the start that can easily handle any case […] i am arguing that general isn't actually that much harder
>
> **Nathan:** if you'd be around to build and iterate on and maintain the general solution, I'd say have a go at it. you could even build the POC anyways so we could compare side by side!
>
> **Peter:** 👍 I'll build a POC

---

## Problem

Fast sync currently requires hand-coding each "standard case" (edited question, created
assessment, …) as a bespoke strategy in `sync/fast/`. Each case re-implements the same shape:
detect that the change applies → load + validate the relevant JSON → apply a safe incremental
DB update → fall back to full sync on any unhandled edge. As cases accumulate, cross-entity
ripples (rename a tag → every question referencing it must resync) must be reasoned about and
hand-wired per case.

## Outcome

A mechanism where the dependency structure between syncable objects is modeled explicitly, so
that **adding a fast-sync case = declare a node type + its edges + its safe-update function**,
and "what to resync" + "in what order" come from the engine rather than from per-case code.
The POC must be comparable side-by-side with Nathan's per-case dispatcher (the `fast-sync-questions`
branch) so we can judge Peter's claim that "general isn't actually that much harder."

---

## Requirements (R)

| ID | Requirement | Status |
|----|-------------|--------|
| R0 | Apply a localized file change by updating only the affected DB rows, instead of full-resyncing the whole course | Core goal |
| R1 | Resulting DB state is identical to what a full sync would have produced | Must-have |
| R2 | On any unhandled edge case, ambiguity, or error, abort and fall back to full sync — never partially apply | Must-have |
| R3 | 🟡 Cross-entity ripples are resynced too: a change to X resyncs everything transitively affected by X. **In-scope for POC** — demonstrated via question grading-method/points change → dependent assessments | Must-have (decided) |
| R4 | 🟡 When multiple objects must sync, they sync in dependency order (e.g. questions before assessments that reference them) | Must-have (decided) |
| R5 | Adding a new fast-sync case is additive and localized — no editing of unrelated cases | Must-have |
| R6 | Chunk generation/upload still happens for affected questions/objects | Must-have |
| R7 | Hooks into `syncCourseFromDisk` (editors.ts), driven by the git diff between start/end commit hashes; coexists with and falls back to `syncDiskToSqlWithLock` | Must-have |
| R8 | 🟡 The solution is something one person can build, iterate on, and maintain. **Bar (decided):** engine core ≤ ~150 LOC AND adding a node type touches zero existing cases | Must-have (gate) |

---

## CURRENT: Per-case strategy dispatcher (`fast-sync-questions` branch)

| Part | Mechanism | Flag |
|------|-----------|:----:|
| CUR1 | `getFastSyncStrategy(changedFiles)` pattern-matches the git diff to a known case; today only the Question case (all files under `questions/`, longest-common-path-prefix → candidate QID) | |
| CUR2 | `attemptFastSync` switches on strategy type → bespoke `fastSyncQuestion()` | |
| CUR3 | `fastSyncQuestion` carries ~10 inline guards that each `return null` → caller falls back to full sync (UUID mismatch, missing topic, nonexistent tag, Manual grading flip, deletions, new-question-by-existing-UUID, non-question files under `questions/`, …) | |
| CUR4 | Within the Question case, dependent objects (tags, authors) are resynced by hand-written inline calls | |
| CUR5 | Wired in `syncCourseFromDisk`: diff hashes → strategy → attempt → on `false`, full sync; on success, regenerate chunks + `updateCourseCommitHash` | |

Cross-*type* ripples are not handled: a change to `infoCourse.json` (where tags/topics live) has
changed files outside `questions/`, so `getFastSyncStrategy` returns null and it full-syncs.

---

## A: Type-level static DAG + DB-driven dependent resolution

Nodes = entity **types** (CourseInfo, Topic, Tag, AssessmentSet, AssessmentModule, SharingSet,
Question, CourseInstance, Assessment, Author). Edges = static "depends-on" relationships declared
once. Dirty *instances* are discovered from the diff; dependents are found by querying the DB
("which assessments use this question").

| Part | Mechanism | Flag |
|------|-----------|:----:|
| A1 | Node-type registry: each type declares `matchChangedFiles(diff) → dirty instances`, `dependsOn: NodeType[]`, and `syncInstance(instance) → 'ok' \| 'fallback'` | |
| A2 | Engine: diff → dirty instances → walk reverse edges, using per-type DB queries to expand type-level edges into concrete dependent instances → transitive closure | ⚠️ |
| A3 | Topo-sort the closure by the static type DAG; run each instance's `syncInstance` in order | |
| A4 | Any `syncInstance` returning `'fallback'` (or any throw) aborts the whole fast sync → `syncDiskToSqlWithLock` | |
| A5 | Per-type safe-update logic (the CUR3 guards) lives inside each `syncInstance` — the graph does **not** remove this work | |
| A6 | Same `syncCourseFromDisk` hook as CURRENT; chunks + commit-hash handled by engine | |

---

## B: Instance-level materialized DAG

Build an actual graph of object *instances* and their concrete dependencies (this question →
these 3 assessments), as Peter's "model each file/object as a node" phrasing literally describes,
then traverse.

| Part | Mechanism | Flag |
|------|-----------|:----:|
| B1 | Materialize a graph of concrete instances + edges from the DB (and/or disk) | ⚠️ |
| B2 | Mark dirty nodes from the diff; reachability traversal over materialized edges | |
| B3 | Topo-sort + per-instance safe-update (same guards as A5) | |
| B4 | Fallback identical to A4 | |
| B5 | Same hook as CURRENT | ⚠️ |

---

## Fit Check  →  **Selected: Shape A**

| Req | Requirement | Status | CURRENT | A | B |
|-----|-------------|--------|:-------:|:-:|:-:|
| R0 | Apply a localized file change by updating only affected DB rows | Core goal | ✅ | ✅ | ✅ |
| R1 | Resulting DB state identical to a full sync | Must-have | ✅ | ✅ | ✅ |
| R2 | Conservative fallback to full sync on any unhandled case | Must-have | ✅ | ✅ | ✅ |
| R3 | Cross-entity ripples resynced transitively | Must-have (decided) | ❌ | ✅ | ✅ |
| R4 | Sync in dependency order | Must-have (decided) | ❌ | ✅ | ✅ |
| R5 | Adding a case is additive and localized | Must-have | ❌ | ✅ | ✅ |
| R6 | Chunks still generated for affected objects | Must-have | ✅ | ✅ | ✅ |
| R7 | Hooks into `syncCourseFromDisk`, diff-driven, falls back | Must-have | ✅ | ✅ | ✅ |
| R8 | Engine ≤ ~150 LOC AND adding a node type touches zero existing cases | Must-have (gate) | ✅ | ✅ | ❌ |

**R8 note (POC-verified):** the engine (`engine.ts` = A1+A2+A3) is **74 lines of code** (124 with
doc comments) — well under the bar. Adding the Assessment node was purely additive: a new
self-contained `nodes/assessment.ts` (39 LOC) + `assessment.sql` (33 LOC) + one entry in the
registry, touching **zero** existing cases. The Question node reuses the per-case safety logic via
2 exports + 1 parameter on `sync/fast`. Peter's claim ("general isn't that much harder") holds for
this POC. CURRENT keeps ✅ (demonstrably small today); B stays ❌.

**Notes:**
- **R1/R2 are equal work across all three.** The graph gives you *what* to resync and *in what
  order* — it provides ~zero help with the per-node safety guards (CUR3 / A5), which are the bulk
  of the code. This is the single most important insight for the comparison: the graph's value is
  concentrated in R3, R4, R5.
- CURRENT fails R3/R4 *as general guarantees*: it can handle ripples only by hand-coding them per
  case, and currently handles none across types. It fails R5 because adding a case means extending
  the dispatcher and possibly editing existing cases to add ripple edges.
- A × R8 is **⚠️ (contested)** — this is exactly what the POC resolves. Peter: "general isn't that
  much harder." Nathan: more machinery to maintain. Marked ⚠️ until the POC shows the engine + edge
  declarations are small.
- B fails R8: materializing an instance-level graph is heavier and adds correctness surface for
  little gain over A, since A already gets ripples via DB queries.

---

## Resolved decisions

1. **Shape A selected** (type-level static DAG + DB-driven dependent resolution). B rejected (fails
   R8 — instance materialization is heavy for no gain over A; A gets ripples via DB queries anyway).
   CURRENT is the baseline to beat.
2. **R3 is in-scope** — the POC demonstrates one real cross-type ripple, not just argues for it.
3. **R8 bar = both**: engine core ≤ ~150 LOC AND adding a node type touches zero existing cases.
4. 🟡 **Cross-type case pivoted: question change → dependent assessments** (not tag rename).
   Rationale: tags have no UUID (matched by `(course_id, name)`), so a "rename" is ambiguous
   delete+create — a poor demo. The question→assessment ripple is **the exact case CURRENT
   explicitly falls back on** (the Manual grading-method guard, which says a grading-method flip
   "will change point allocations in assessments"). Turning that fallback into a fast path is the
   most compelling side-by-side win. Dependent discovery uses the existing
   `selectAssessmentsReferencingQuestions({ course_id, question_ids })`.

---

## Detail A: Concrete affordances

### Canonical type DAG (mirrors `syncFromDisk` ordering, lines 149–252)

```
CourseInfo ──┬─→ CourseInstance ──┐
             ├─→ Topic ─→ Question ─→ Author
             ├─→ AssessmentSet ────┤
             ├─→ AssessmentModule ─┤
             └─→ SharingSet        ├─→ Assessment ─→ AccessControl
                  Question ────────┘
```

POC implements the **Question → Assessment** edge (bold path). The rest is declared as the engine
grows; declaring an edge is the additive unit (R5).

### Parts (resolved)

| Part | Mechanism | Flag |
|------|-----------|:----:|
| A1 | `NodeType` registry. Each entry: `matchChangedFiles(diff) → DirtyInstance[]`, `dependents(instances) → DirtyInstance[]` (DB-backed), `topoRank: number`, `syncInstance(instance) → 'ok' \| 'fallback'` | |
| A2 | Engine `resolve(diff)`: collect dirty instances from every node type → BFS over `dependents()` to transitive closure → sort by `topoRank` | |
| A3 | Engine `run(closure)`: `syncInstance` each in topo order inside one transaction; first `'fallback'` or throw → abort tx, return `false` → caller does `syncDiskToSqlWithLock` | |
| A4 | **Question node** = port of Nathan's `fastSyncQuestion`, **minus** the Manual grading-method bail (that ripple is now handled). `dependents` = `selectAssessmentsReferencingQuestions` | |
| A5 | ~~Assessment node = narrow recompute of `max_manual_points`/`max_auto_points`~~ **superseded in Iteration 2** by whole-object re-sync (`syncSingleAssessment`). See below. | |

| A6 | Same `syncCourseFromDisk` hook as CURRENT; engine emits the chunk set + calls `updateCourseCommitHash` | |

A1–A4, A6 are registry + BFS + topo-sort + a port of existing code + the existing hook. A5 was
initially a narrow per-edge recompute; **Iteration 2 replaced it** with a uniform whole-object
re-sync (every node re-derives its object from disk) — see the section below.

### R8 self-check (the gate)
- **Engine = A1 + A2 + A3 only** (registry type + BFS + topo-sort + transactional run). Target ≤ ~150 LOC.
- **Additive**: a new case = one new `NodeType` entry + its `.sql`. Engine and other nodes untouched. ✅

---

## Build outcome (POC complete)

Built on top of Nathan's `fast-sync-questions` branch (merged in) so the Question node reuses his
exact safety logic and the only genuinely new code is the engine + Assessment node.

> Note: the table below is the Iteration-1 snapshot (narrow recompute, flag-gated). See
> **Iteration 2** for the final shape (whole-object re-sync, graph-only, renames + assessment edits).

| File | LOC | Role |
|------|----:|------|
| `fast-graph/engine.ts` | 124 (74 code) | A1+A2+A3 — the whole engine |
| `fast-graph/index.ts` | 23 | registry + `attemptGraphFastSync` |
| `fast-graph/nodes/question.ts` | 71 | Question node (reuses `sync/fast` via 2 exports + 1 param) |
| `fast-graph/nodes/assessment.ts` | 39 | Assessment node — brand new, self-contained |
| `fast-graph/nodes/assessment.sql` | 33 | the manual/auto recompute (deleted in Iteration 2) |

Edits to existing code (all minimal / mechanical):
- `sync/fast/question.ts`: `export` two helpers + add `skipGradingMethodBail` param.
- `lib/chunks.ts`: `export type ChunkMetadata`.
- `lib/config.ts`: add `fastSyncUseGraph` flag (default off).
- `lib/editors.ts`: branch `syncCourseFromDisk` on the flag — graph engine vs dispatcher.

**Tests (9, all green):** `engine.test.ts` (6, synthetic nodes — claim/fallback, topo order, chunk
collection, transactional rollback, closure dedup); `index.test.ts` (3, integration — the
grading-method ripple end-to-end, chunk reporting, fallback on mixed diff). Nathan's 33 tests
still pass.

**Verdict on R8:** engine 74 code LOC ≪ 150; adding the Assessment node touched zero existing
cases. Both halves of the gate met. The graph buys R3 (ripple) + R4 (order) + R5 (additive) for a
~74-line engine; per-node safety (R1/R2) is the same work as CURRENT either way. The headline win:
the graph fast-syncs the question grading-method change that CURRENT explicitly falls back on.

---

## Iteration 2: whole-object re-sync (supersedes the narrow recompute)

Feedback: *"why resync specific properties on edges instead of just resyncing the entire
dependent object?"* — correct. The narrow `recompute_question_points_split` (A5) was per-edge
specialized SQL only because no single-object assessment sync existed. Replaced with a uniform
model: **every node's `sync` re-derives its whole object from disk; edges are pure dirty
propagation.** This also dissolved the rename-ripple problem.

**New primitive — `syncSingleAssessment`** (`fromDisk/assessments.ts`). Re-syncs one assessment
from disk without disturbing siblings, via a new `partial_sync boolean DEFAULT false` parameter on
the central `sync_assessments` sproc. Only two CI-wide steps are guarded by it (sibling
soft-delete + the "DB has extra assessments" assertion); all per-assessment upsert logic is reused
unchanged. Cross-entity re-validation is skipped (the assessment was valid at last full sync and
the triggering edit doesn't invalidate it) — a documented simplification; cases that could
invalidate it (deletion, assessment rename) fall back.

**Node changes:**
- **Assessment node** now `match`es a modified `infoAssessment.json` → dirty assessment, *and*
  serves as a ripple target — both run `syncSingleAssessment`. So **direct assessment edits now
  fast-sync** (new capability), and a question grading-method change ripples → the assessment
  re-syncs fully (no special recompute SQL).
- **Question node** folds upsert + **rename** into one node (discriminated payload). A grading-method
  change no longer bails — it ripples. A **rename** (detected from `identifyChangedFiles`'s new
  rename info) updates the `questions` row's qid (matched by UUID) via `syncQuestionRename`; its
  referencing assessments are re-synced from their rewritten JSON, so **referenced-question renames
  fast-sync correctly** — the earlier conservative fallback is no longer needed.

**`identifyChangedFiles`** now returns structured `ChangedFiles { modified, deleted, renamed }`
(via `git diff --name-status -M`); `changedFilePaths()` flattens it for the chunk path.

**Dispatcher removed (graph is the sole fast-sync path):** dropped the `fastSyncUseGraph` flag,
`attemptFastSync`, and `fastSyncQuestion`; `editors.ts` calls only `attemptGraphFastSync`.
`getFastSyncStrategy` + `syncQuestionJson` remain as reused building blocks. Assessment renames /
deletions and multi-question moves still fall back (R2).

**Tests (all green):** `engine.test.ts` (6, synthetic engine); `fast-graph/index.test.ts` (6:
grading-method ripple, **direct assessment edit**, **question rename**, chunk reporting, fallback
on unrecognized file); migrated `fast/question.test.ts` (33, now driven through the graph) + the
matcher unit tests; full `assessmentsSync.test.ts` bulk suite (168) confirms the `partial_sync`
sproc change is safe.
