# Shared state

Shared state lets questions in the same assessment instance read and write a small amount of common data, so that a later question can build on what a student did in an earlier one. For example, a "pick a theme" question can set a theme that later questions use to flavor their wording, or two questions can cooperate on a single multi-step design (see [issue #5501](https://github.com/PrairieLearn/PrairieLearn/issues/5501) for the motivating discussion).

A course declares one or more **shared-state objects** in `infoCourse.json`. Each object is a small, flat, typed record — a name, a list of typed properties with defaults, and a data version. Questions declare which objects they need in their own `info.json`, and access the current value through `data["shared_state"]` in `server.py`.

## Defining a shared-state object

Add a `sharedState` entry to `infoCourse.json`:

```json title="infoCourse.json"
{
  "sharedState": {
    "labProgress": {
      "scope": "assessmentInstance",
      "dataVersion": 1,
      "properties": {
        "stage": { "type": "number", "default": 0 },
        "status": {
          "type": "string",
          "default": "notStarted",
          "enum": ["notStarted", "inProgress", "complete"]
        }
      }
    }
  }
}
```

- **`scope`**: the lifetime of the object's values. Only `"assessmentInstance"` is currently supported — values are shared across all questions within one student's (or one group's) attempt at an assessment, and are independent between different assessment instances. Course-instance-wide scope (sharing across assessments, or across a whole semester) is not yet implemented.
- **`dataVersion`**: a positive integer you control. It's a compatibility boundary: bump it whenever you make a breaking change to `properties` (changing a property's type or default, removing or renaming a property, or narrowing an `enum`). Bumping it resets every assessment instance's stored value for that object back to the new schema's defaults. Adding a property or widening an `enum` doesn't require a bump. PrairieLearn will report a sync error if it detects a breaking change without a version bump, or if `dataVersion` decreases from a value that was already used.
- **`properties`**: a flat map of property name to `{ type, default, enum? }`, using the same `string` / `number` / `boolean` types (and optional `enum`) as [question preferences](preferences.md).

## Declaring access from a question

A question that reads or writes a shared-state object must declare it in its own `info.json`:

```json title="info.json"
{
  "sharedStateAccess": ["labProgress"]
}
```

Sync reports an error if a question declares access to an object name that isn't defined in the course's `sharedState`.

## Using shared state in `server.py`

Declared objects are available under `data["shared_state"]`, keyed by object name, in `generate`, `prepare`, `parse`, and `grade`:

```python title="server.py"
def generate(data):
    stage = data["shared_state"]["labProgress"]["stage"]
    data["params"]["stage_description"] = f"You are on stage {stage}."

def grade(data):
    data["shared_state"]["labProgress"]["stage"] += 1
    data["score"] = 1
```

Reads always see the current, live value, normalized against the object's schema (missing properties are filled with their default; a stored value of the wrong type or outside its `enum` is replaced with the default rather than raised as an error). Writes are validated strictly — an out-of-schema value (wrong type, value outside `enum`, or exceeding the size limit) becomes a fatal course issue rather than being silently accepted or truncated. Two questions writing different properties of the same object at the same time will both be applied; two questions writing the _same_ property at the same time will end up with whichever write is applied last.

`shared_state` is **not** available in `question.html`, in element code, or during `render`/`test`/`file`. If you need a value to appear in wording, read it in `generate()` and copy it into `data["params"]` as shown above — this also means, like any other `params` value, it's frozen for the lifetime of that variant. If you need the _current_ value at render time, request a new variant.

## Ordering is not guaranteed

Questions in an assessment can be opened, and their variants generated, in any order — this is especially true on exams, where question order can be randomized per student. Never assume an earlier question in the zone has already been visited when a later question's `generate()` runs. Guard reads with a check for whether the value has been initialized, and pick sensible defaults for the case where it hasn't:

```python title="server.py"
def generate(data):
    status = data["shared_state"]["labProgress"]["status"]
    if status == "notStarted":
        # The student hasn't reached the setup question yet; fall back to a
        # sensible default rather than assuming it has already run.
        data["params"]["assumed_value"] = 10
    else:
        data["params"]["assumed_value"] = data["shared_state"]["labProgress"]["derived_value"]
```

If your questions must be answered in a specific order, enforce that explicitly — for example with [assessment lockpoints](../assessment/configuration.md#lockpoints), or by having `parse()` reject a submission as invalid when a prerequisite object property hasn't been set yet.

## Instructor preview

Shared state is currently only available to questions accessed through a real assessment instance. Previewing a question directly (from the question page, or in a course with no assessment) does not read or write any stored value.

## Limits

Each object's value is capped at a small number of bytes when JSON-encoded, and the total size of all shared-state values for one assessment instance is capped as well, so that a course cannot work around the per-object limit by defining many small objects. A write that would exceed either limit is rejected as a course issue.
