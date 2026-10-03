# Shared state

Shared state lets questions in the same assessment instance read and write a small amount of common data, so that a later question can build on what a student did in an earlier one. For example, a "pick a theme" question can set a theme that later questions use to flavor their wording, or two questions can cooperate on a single multi-step design (see [issue #5501](https://github.com/PrairieLearn/PrairieLearn/issues/5501) for the motivating discussion).

A course declares one or more **shared-state objects** in `infoCourse.json`. Each object is a small, flat, typed record — a name, a stable UUID, a list of typed properties with defaults, and a data version. Questions bind those course objects to local names in their own `info.json`, and access the current value through `data["shared_state"]` in `server.py`.

## Defining a shared-state object

Add a `sharedState` entry to `infoCourse.json`:

```json title="infoCourse.json"
{
  "sharedState": {
    "assessmentTheme": {
      "uuid": "0a6fd77e-0a2d-43cd-a174-58279404e54e",
      "scope": "assessmentInstance",
      "dataVersion": 1,
      "properties": {
        "theme": {
          "type": "string",
          "default": "sports",
          "enum": ["sports", "cooking", "travel"]
        }
      }
    }
  }
}
```

- **`uuid`**: a stable identifier for this logical shared-state object. Keep it the same when copying the object definition to another course so PrairieLearn can recognize that copied questions are referring to the same object, even if the course-local name changes.
- **`scope`**: the lifetime of the object's values. Only `"assessmentInstance"` is currently supported — values are shared across all questions within one student's (or one group's) attempt at an assessment, and are independent between different assessment instances. Course-instance-wide scope (sharing across assessments, or across a whole semester) is not yet implemented.
- **`dataVersion`**: a positive integer you control. It's a compatibility boundary: bump it whenever you make a breaking change to `properties` (changing a property's type or default, removing or renaming a property, or narrowing an `enum`). Bumping it resets every assessment instance's stored value for that object back to the new schema's defaults. Adding a property or widening an `enum` doesn't require a bump. PrairieLearn will report a sync error if it detects a breaking change without a version bump, or if `dataVersion` decreases from a value that was already used.
- **`properties`**: a flat map of property name to `{ type, default, enum? }`, using the same `string` / `number` / `boolean` types (and optional `enum`) as [question preferences](preferences.md).

## Declaring access from a question

A question that reads or writes a shared-state object must declare it in its own `info.json`:

```json title="info.json"
{
  "sharedStateAccess": {
    "themeState": "assessmentTheme"
  }
}
```

The key (`"themeState"`) is the local name that appears in `server.py`; the value (`"assessmentTheme"`) is the course-level object name declared in `infoCourse.json`. This indirection keeps Python code independent from the course-level object name. Sync reports an error if a question binds to an object name that isn't defined in the course's `sharedState`.

A question that declares `sharedStateAccess` cannot also set `shareSourcePublicly`: copying a question's source into another course doesn't yet carry over its shared-state object definition, so this combination is rejected as a sync error. [Sharing the question itself](../contentSharing.md) (`sharePublicly`, or via a sharing set) is unaffected — the shared-state object continues to resolve against the question's owning course.

## Using shared state in `server.py`

Declared objects are available under `data["shared_state"]`, keyed by the local name from `sharedStateAccess`, in `generate`, `prepare`, `parse`, and `grade`. For example, a "pick an assessment theme" question can write the student's choice when it's graded:

```python title="server.py"
def grade(data):
    theme = data["submitted_answers"].get("theme")
    if theme in ("sports", "cooking", "travel"):
        data["shared_state"]["themeState"]["theme"] = theme
    data["score"] = 1.0
```

and a later arithmetic question can read it in `generate()` to flavor its wording:

```python title="server.py"
THEME_PROMPTS = {
    "sports": "A track coach organizes {a} practice sessions, each with {b} laps.",
    "cooking": "A chef prepares {a} batches of cookies, with {b} cookies in each batch.",
    "travel": "A tour guide leads {a} tours, each visiting {b} stops.",
}


def generate(data):
    theme = data["shared_state"]["themeState"]["theme"]
    a, b = 6, 4
    data["params"]["prompt"] = THEME_PROMPTS[theme].format(a=a, b=b)
    data["correct_answers"]["c"] = a * b
```

Reads always see the current, live value, normalized against the object's schema (missing properties are filled with their default; a stored value of the wrong type or outside its `enum` is replaced with the default rather than raised as an error). Writes are validated strictly — an out-of-schema value (wrong type, value outside `enum`, or exceeding the size limit) becomes a fatal course issue rather than being silently accepted or truncated. Two questions writing different properties of the same object at the same time will both be applied; two questions writing the _same_ property at the same time will end up with whichever write is applied last.

`shared_state` is **not** available in `question.html`, in element code, or during `render`/`test`/`file`. If you need a value to appear in wording, read it in `generate()` and copy it into `data["params"]` as shown above — this also means, like any other `params` value, it's frozen for the lifetime of that variant. If you need the _current_ value at render time, request a new variant.

## Ordering is not guaranteed

Questions in an assessment can be opened, and their variants generated, in any order — this is especially true on exams, where question order can be randomized per student. Never assume an earlier question in the zone has already been visited when a later question's `generate()` runs. Instead, pick a default that works as a sensible fallback, as `"sports"` does above: an arithmetic question reads `assessmentTheme.theme` without checking whether the "pick a theme" question has run yet, because the default theme produces a perfectly good prompt either way.

If a property's default _can't_ double as a sensible fallback — for example, you need to tell "not yet set" apart from "explicitly set to the default value" — add an explicit flag property (e.g. `"themeChosen": { "type": "boolean", "default": false }`) and check it before trusting the rest of the object. If your questions must be answered in a specific order, enforce that explicitly — for example with [assessment lockpoints](../assessment/configuration.md#lockpoints), or by having `parse()` reject a submission as invalid when a prerequisite object property hasn't been set yet.

## Instructor preview

Previewing a question directly (from the question page, or in a course with no assessment) has no assessment instance to scope shared state to, so values are instead scoped to the user doing the preview. Each object's value persists across submissions and across "New variant" clicks for that user, independently of any real assessment instance's stored value, but is shared across every question in every course that previews the same object.

## Limits

Each object's value is capped at a small number of bytes when JSON-encoded. A write that would exceed this limit is rejected as a course issue.
