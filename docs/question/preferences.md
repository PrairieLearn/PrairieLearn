# Question preferences

Question preferences allow a single question to be customized for different assessments without duplicating the question. A question defines a **preferences schema** in its `info.json`, and each assessment can **override** the default values when including the question.

Preferences are available in both `server.py` (via `data["preferences"]`) and `question.html` (via `{{preferences.key}}`).

## Defining preferences

Preferences can be managed through the **Question Settings** page or by editing `info.json` directly.

### Using the question settings page

On the question settings page, the **Preferences** section displays a table where you can add, edit, reorder, and remove preferences. Each preference has:

- **Name**: a unique identifier used to reference the preference in code (e.g., `show_hints`).
- **Type**: `string`, `number`, or `boolean`.
- **Default**: the value used when the assessment does not provide an override.
- **Allowed values**: an optional set of allowed values. When set, the default and any assessment override must be one of these values. If left empty (shown as "Any value"), any value matching the type is accepted.

Preferences can be reordered by dragging the handle on the left side of each row.

### Using JSON

Add a `preferences` object to your question's `info.json`. Each key defines a preference field with a `type`, a `default` value, and an optional `enum` of allowed values.

```json title="info.json"
{
  "uuid": "302d2d6c-a8a4-4413-97dc-79344d75a5f0",
  "title": "Force on a falling object",
  "topic": "Forces",
  "type": "v3",
  "preferences": {
    "gravitational_constant": {
      "type": "number",
      "default": 9.8
    },
    "fired_object": {
      "type": "string",
      "enum": ["cannon ball", "bowling ball"],
      "default": "cannon ball"
    }
  }
}
```

### Preference field properties

| Property  | Type                                   | Description                                                                                                         |
| --------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `type`    | `"string"`, `"number"`, or `"boolean"` | The data type of the preference value. (Required)                                                                   |
| `default` | string, number, or boolean             | The default value used when the assessment does not provide an override. Must match the declared `type`. (Required) |
| `enum`    | array of strings or numbers            | An optional list of allowed values. If provided, both the default and any assessment override must be in this list. |

## Overriding preferences in assessments

Preference overrides can be set through the **Assessment Questions** editor or by editing `infoAssessment.json` directly.

### Using the assessment questions editor

In the assessment questions page, click **Edit** to enter edit mode, then expand a question that defines preferences. Each preference is shown with its current override value. Select a value from the dropdown or type one in to override the question default. To revert to the question default, clear the field or select the "Default" option.

### Using JSON

In `infoAssessment.json`, add a `preferences` object to a question entry. Only the preferences you specify are overridden; the rest use their defaults.

```json title="infoAssessment.json"
{
  "uuid": "c113ec72-acb7-41fb-8e76-62f2e79cd7f0",
  "type": "Homework",
  "set": "Homework",
  "number": "5",
  "title": "Forces on Earth",
  "allowAccess": [{ "credit": 100 }],
  "zones": [
    {
      "questions": [
        {
          "id": "forces/fallingObject",
          "autoPoints": 1,
          "preferences": {
            "fired_object": "bowling ball",
            "gravitational_constant": 9.8
          }
        }
      ]
    }
  ]
}
```

Overrides are validated against the question's preferences schema during sync. If you provide a value that doesn't match the declared `type` or isn't in the `enum` list, a sync error will be reported.

!!! warning

    Support for preferences with shared questions is not perfect; preferences are only validated at sync time against the shared question's preferences schema.

Preferences can also be set on individual alternatives within a question alternative pool:

```json title="infoAssessment.json"
{
  "numberChoose": 1,
  "alternatives": [
    {
      "id": "forces/fallingObject",
      "preferences": { "gravitational_constant": 9.8 }
    },
    {
      "id": "forces/fallingObject",
      "preferences": { "gravitational_constant": 1.6 }
    }
  ]
}
```

## Using preferences in `question.html`

Preference values are available in Mustache templates under the `{{preferences.key}}` namespace, just like `{{params.key}}`:

<!-- prettier-ignore -->
```html title="question.html"
<pl-question-panel>
  <p>
    A {{preferences.fired_object}} with mass $m = {{params.m}} \rm\ kg$
    is dropped from a cliff.
  </p>
  <p>
    Assume the acceleration due to gravity is
    $g = {{preferences.gravitational_constant}} \rm\ m/s^2$.
  </p>
  <p>What is the magnitude of the net force acting on the {{preferences.fired_object}}?</p>
</pl-question-panel>

<pl-number-input answers-name="force" label="$F = $"></pl-number-input>
```

## Using preferences in `server.py`

Preference values are available in the `data["preferences"]` dictionary. This dictionary is read-only and available in all `server.py` functions (`generate`, `prepare`, `render`, `parse`, `grade`, `file`, `test`).

```python title="server.py"
import random


def generate(data):
    m = random.choice([2, 5, 10, 15, 20, 25, 50])
    g = float(data["preferences"]["gravitational_constant"])

    data["params"]["m"] = m
    data["correct_answers"]["force"] = m * g
```

## Examples

### Configuring units (SI vs imperial)

A question can support different unit systems by defining a preference:

```json title="info.json"
{
  "uuid": "...",
  "title": "Projectile range",
  "topic": "Kinematics",
  "type": "v3",
  "preferences": {
    "unit_system": {
      "type": "string",
      "enum": ["SI", "imperial"],
      "default": "SI"
    }
  }
}
```

```python title="server.py"
import random
import math

def generate(data):
    if data["preferences"]["unit_system"] == "SI":
        g = 9.8
        unit = "m"
    else:
        g = 32.2
        unit = "ft"

    v0 = random.choice([10, 15, 20, 25])
    angle = random.choice([30, 45, 60])

    data["params"]["v0"] = v0
    data["params"]["angle"] = angle
    data["params"]["unit"] = unit
    data["correct_answers"]["range"] = round(v0**2 * math.sin(2 * math.radians(angle)) / g, 2)
```

Then one assessment can use `"preferences": { "unit_system": "SI" }` and another can use `"preferences": { "unit_system": "imperial" }`, reusing the same question.

### Adjusting difficulty

A boolean preference can control whether hints are shown:

```json title="info.json (preferences only)"
{
  "preferences": {
    "show_hints": {
      "type": "boolean",
      "default": true
    }
  }
}
```

<!-- prettier-ignore -->
```html title="question.html"
{{#preferences.show_hints}}
<pl-hidden-hints>
  <pl-hint>Remember that $F = ma$.</pl-hint>
</pl-hidden-hints>
{{/preferences.show_hints}}
```

A practice homework could keep the default (`true`), while an exam assessment overrides it:

```json
{ "id": "forces/fallingObject", "autoPoints": 5, "preferences": { "show_hints": false } }
```

### Reusing a question across course instances with different contexts

A question about statistics can change the dataset context:

```json title="info.json (preferences only)"
{
  "preferences": {
    "dataset_context": {
      "type": "string",
      "enum": ["weather", "stock prices", "exam scores"],
      "default": "exam scores"
    }
  }
}
```

<!-- prettier-ignore -->
```html title="question.html"
<pl-question-panel>
  <p>Given the following {{preferences.dataset_context}} data, compute the sample mean.</p>
</pl-question-panel>
```
