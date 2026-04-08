# Modern access control

!!! warning "Not yet generally available"

    This feature is under active development and is not yet available for general use. The documentation here is for internal reference only.

The modern access control system uses a structured `accessControl` array in `infoAssessment.json`, replacing the legacy [`allowAccess`](accessControl.md) system. It provides a clearer model for managing deadlines, credit, and per-student overrides.

!!! note

    The two-level access check still applies: students must first have access to the **course instance** (via [publishing controls](../courseInstance/index.md#publishing-controls)), and then must also have access to the specific **assessment** (via `accessControl`). See [Access control checks](accessControl.md#access-control-checks) for details.

## `accessControl` format

The `accessControl` field is an array of entries in `infoAssessment.json`:

```json
{
  "accessControl": [
    {
      /* defaults — applies to all students */
    },
    {
      /* override — targets specific students via labels */
    },
    {
      /* override — targets specific students via labels */
    }
  ]
}
```

- The **first element** (index 0) is the **defaults**. It applies to all students and sets the default behavior for the assessment.
- **Subsequent elements** are **overrides**. Each override targets specific students using [student labels](#student-labels-and-overrides) or individual enrollments (configured via the UI), and can change any subset of the defaults' fields except `listBeforeRelease`.

### Full JSON skeleton

Below is a complete skeleton showing all available fields. All fields are optional unless noted.

```json
{
  "accessControl": [
    {
      "listBeforeRelease": false,
      "dateControl": {
        "releaseDate": "2025-01-15T00:00:01",
        "dueDate": "2025-02-15T23:59:59",
        "earlyDeadlines": [{ "date": "2025-02-01T23:59:59", "credit": 110 }],
        "lateDeadlines": [{ "date": "2025-02-22T23:59:59", "credit": 80 }],
        "afterLastDeadline": {
          "allowSubmissions": true,
          "credit": 0
        },
        "durationMinutes": 60,
        "password": "mysecret"
      },
      "integrations": {
        "prairieTest": {
          "exams": [{ "examUuid": "5719ebfe-ad20-42b1-b0dc-c47f0f714871" }]
        }
      },
      "afterComplete": {
        "hideQuestions": true,
        "showQuestionsAgainDate": "2025-03-01T00:00:01",
        "hideQuestionsAgainDate": "2025-06-01T00:00:01",
        "hideScore": true,
        "showScoreAgainDate": "2025-03-01T00:00:01"
      }
    },
    {
      "labels": ["Extended time"],
      "dateControl": {
        "dueDate": "2025-02-22T23:59:59",
        "durationMinutes": 90
      }
    }
  ]
}
```

## Defaults fields

### `dateControl`

Controls when the assessment is available and how credit is computed over time.

| Field               | Type    | Description                                                                                            |
| ------------------- | ------- | ------------------------------------------------------------------------------------------------------ |
| `releaseDate`       | string  | ISO datetime. The assessment is not visible to students before this date.                              |
| `dueDate`           | string  | ISO datetime. The primary deadline. Students receive 100% credit before this date.                     |
| `earlyDeadlines`    | array   | Array of `{date, credit}` objects. Deadlines _before_ the due date offering bonus credit (e.g., 110%). |
| `lateDeadlines`     | array   | Array of `{date, credit}` objects. Deadlines _after_ the due date offering reduced credit (e.g., 80%). |
| `afterLastDeadline` | object  | Controls behavior after all deadlines have passed. See below.                                          |
| `durationMinutes`   | integer | Time limit in minutes for timed assessments.                                                           |
| `password`          | string  | Proctor password required to start the assessment.                                                     |

#### `afterLastDeadline`

| Field              | Type    | Default     | Description                                                    |
| ------------------ | ------- | ----------- | -------------------------------------------------------------- |
| `allowSubmissions` | boolean | (see below) | Whether students can still submit answers after all deadlines. |
| `credit`           | number  | `0`         | Credit percentage after the last deadline.                     |

After the last deadline, the assessment is considered "active" (students can submit) only if `credit > 0` **and** `allowSubmissions` is not `false`.

#### Credit timeline

The credit a student receives depends on when they submit relative to the configured deadlines. All deadlines (early, due, and late) are sorted chronologically into a timeline:

```text
earlyDeadline (110%)    dueDate (100%)    lateDeadline (80%)
      |                      |                   |
------+----------------------+-------------------+-------
110% credit             100% credit          80% credit    → afterLastDeadline
```

- **Before `releaseDate`**: The assessment is not visible (unless `listBeforeRelease` is `true`, in which case the title is shown but the assessment cannot be opened).
- **Between `releaseDate` and the first deadline**: Credit is the first entry's value (the highest credit in the timeline).
- **Between each pair of deadlines**: Credit is the later deadline's value.
- **After the last deadline**: Credit is `afterLastDeadline.credit` (default 0%).
- **No `dateControl` or no `releaseDate`**: The assessment is listed on the Assessments page but is not active — students cannot start it or submit answers.

### `integrations`

#### PrairieTest

| Field                          | Type    | Description                                 |
| ------------------------------ | ------- | ------------------------------------------- |
| `prairieTest.exams`            | array   | Array of exam objects.                      |
| `prairieTest.exams[].examUuid` | string  | UUID of the associated PrairieTest exam.    |
| `prairieTest.exams[].readOnly` | boolean | Whether the exam is read-only for students. |

When PrairieTest exams are configured, students must be checked in via PrairieTest to access the assessment. Students not checked in are blocked. The `durationMinutes` field has no effect when PrairieTest is active — time limits are enforced by PrairieTest.

### `afterComplete`

Controls what students can see after completing an assessment. An assessment is considered complete when students can no longer answer questions — typically when the last late deadline passes (or due date if no late deadlines), or when the assessment is closed (e.g., time limit expires, autoclose, or instructor closes it).

By default, questions are hidden and scores are shown after completion.

| Field                    | Type    | Default | Description                                                   |
| ------------------------ | ------- | ------- | ------------------------------------------------------------- |
| `hideQuestions`          | boolean | `true`  | If `true`, questions are hidden after assessment completion.  |
| `showQuestionsAgainDate` | string  |         | ISO datetime. Date to reveal questions back to students.      |
| `hideQuestionsAgainDate` | string  |         | ISO datetime. Date to re-hide questions after revealing them. |
| `hideScore`              | boolean | `false` | If `true`, the score is hidden after assessment completion.   |
| `showScoreAgainDate`     | string  |         | ISO datetime. Date to reveal the score to students.           |

!!! warning

    Setting `hideQuestions` to `false` on an assessment with PrairieTest exams is not recommended. Students may be able to view exam content when their assessment is closed.

The visibility logic follows a toggle pattern:

1. If `hideQuestions` is `true`, questions are hidden after completion.
2. At `showQuestionsAgainDate`, questions become visible again.
3. At `hideQuestionsAgainDate`, questions are hidden again.

The same logic applies to `hideScore` / `showScoreAgainDate` (there is no "hide score again" date).

### Other fields

| Field               | Type    | Default | Description                                                                                                                                                      |
| ------------------- | ------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `listBeforeRelease` | boolean | `false` | Only valid on the first entry (defaults). If `true`, the assessment title is shown on the Assessments page before the release date, but students cannot open it. |

## Student labels and overrides

### What are student labels?

Student labels are groups of students defined at the course instance level (on the **Students** tab). Examples include "Section A", "Extended time", or "Remote students". A student can have multiple labels.

### What are overrides?

Overrides are entries after the defaults in the `accessControl` array. Each override targets specific students using the `labels` field (in JSON) or individual enrollments (configured via the UI). Overrides only set the fields they want to change — unset fields are inherited from the defaults.

### How overrides stack (the cascade)

When a student accesses an assessment, the system resolves which rule applies using the following algorithm:

1. **Start with the defaults** (the first element, which applies to everyone).
2. **Find all matching overrides** for this student:
   - A label-based override matches if the student has _any_ of the listed labels.
   - An enrollment-based override matches if the student is specifically listed.
3. **Sort matching overrides**: label-based overrides first, then enrollment-based overrides. Within the same type, overrides are processed in array order.
4. **Cascade matching overrides together**: Process the matching overrides in order. Each subsequent override's explicitly-set fields replace the previous ones. Fields not set by a later override are kept from earlier ones.
5. **Merge the cascaded result onto the defaults**: The cascaded override's fields replace the defaults' fields where set. Unset fields fall through to the defaults' values.

**Why enrollment overrides come last**: Enrollment-based overrides (targeting individual students) are more specific than label-based ones. By processing them last, they get final say — an individual student override always wins over a label-based one.

**Why multiple label overrides cascade**: If a student has labels "Section A" and "Extended time", and there are separate overrides for both, the overrides are combined. The one later in the array wins for any fields both set, but fields set only by the earlier override are preserved.

### Field inheritance

Not all fields behave the same way during cascading:

| Field                        | Main → Override merge                                                       | Override → Override cascade                             |
| ---------------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------- |
| `dateControl.*` sub-fields   | Override replaces individual sub-fields; unset sub-fields inherit from main | Later override replaces; unset fields kept from earlier |
| `afterComplete.*` sub-fields | Same as `dateControl`                                                       | Same as `dateControl`                                   |
| `listBeforeRelease`          | Cannot be overridden                                                        | Not applicable                                          |

### Override examples

#### Example 1: Extending a deadline for a label

```json
{
  "accessControl": [
    {
      "dateControl": {
        "releaseDate": "2025-01-15T00:00:01",
        "dueDate": "2025-02-15T23:59:59"
      }
    },
    {
      "labels": ["Extended time"],
      "dateControl": {
        "dueDate": "2025-02-22T23:59:59"
      }
    }
  ]
}
```

- **All students**: due Feb 15.
- **Students with "Extended time" label**: due Feb 22. The override replaces `dueDate` but inherits `releaseDate` from the defaults.

#### Example 2: Two label overrides stacking

```json
{
  "accessControl": [
    {
      "dateControl": {
        "releaseDate": "2025-01-15T00:00:01",
        "dueDate": "2025-02-15T23:59:59",
        "durationMinutes": 60
      }
    },
    {
      "labels": ["Section B"],
      "dateControl": {
        "dueDate": "2025-02-20T23:59:59"
      }
    },
    {
      "labels": ["Extended time"],
      "dateControl": {
        "durationMinutes": 90
      }
    }
  ]
}
```

| Student                     | Due date | Duration | Explanation                                                                            |
| --------------------------- | -------- | -------- | -------------------------------------------------------------------------------------- |
| Default                     | Feb 15   | 60 min   | No overrides matched                                                                   |
| Section B only              | Feb 20   | 60 min   | Section B override replaces `dueDate`; `durationMinutes` inherited from defaults       |
| Extended time only          | Feb 15   | 90 min   | Extended time override replaces `durationMinutes`; `dueDate` inherited from defaults   |
| Section B AND Extended time | Feb 20   | 90 min   | Both overrides cascade: Section B sets `dueDate`, Extended time sets `durationMinutes` |

## Examples

### Simple homework with a due date

```json
{
  "accessControl": [
    {
      "dateControl": {
        "releaseDate": "2025-01-15T00:00:01",
        "dueDate": "2025-02-15T23:59:59"
      }
    }
  ]
}
```

Students can access the homework from Jan 15 to Feb 15 for 100% credit. After Feb 15, the assessment is no longer active (0% credit by default).

### Homework with early bonus and late penalty

```json
{
  "accessControl": [
    {
      "dateControl": {
        "releaseDate": "2025-01-15T00:00:01",
        "dueDate": "2025-02-15T23:59:59",
        "earlyDeadlines": [{ "date": "2025-02-01T23:59:59", "credit": 110 }],
        "lateDeadlines": [
          { "date": "2025-02-22T23:59:59", "credit": 80 },
          { "date": "2025-03-01T23:59:59", "credit": 50 }
        ],
        "afterLastDeadline": {
          "allowSubmissions": true,
          "credit": 0
        }
      }
    }
  ]
}
```

| Period          | Credit                                      |
| --------------- | ------------------------------------------- |
| Before Jan 15   | Not visible                                 |
| Jan 15 – Feb 1  | 110% (early bonus)                          |
| Feb 1 – Feb 15  | 100% (full credit)                          |
| Feb 15 – Feb 22 | 80% (late penalty)                          |
| Feb 22 – Mar 1  | 50% (late penalty)                          |
| After Mar 1     | 0% (can still view and submit for feedback) |

### Timed exam with password

```json
{
  "accessControl": [
    {
      "dateControl": {
        "releaseDate": "2025-03-10T09:00:00",
        "dueDate": "2025-03-10T11:00:00",
        "durationMinutes": 90,
        "password": "exam2025"
      },
      "afterComplete": {
        "hideQuestions": true,
        "hideScore": true,
        "showScoreAgainDate": "2025-03-12T00:00:01"
      }
    }
  ]
}
```

Students have a 90-minute time limit within the 2-hour exam window. A proctor password is required to start. Questions and scores are hidden after completion, with scores revealed on Mar 12.

If a student starts close enough to the due date that less than 90 minutes remain, their timer is capped at the remaining time (minus a small buffer).

### Exam with PrairieTest integration

```json
{
  "accessControl": [
    {
      "integrations": {
        "prairieTest": {
          "exams": [{ "examUuid": "5719ebfe-ad20-42b1-b0dc-c47f0f714871" }]
        }
      },
      "afterComplete": {
        "hideQuestions": true
      }
    }
  ]
}
```

Students must be checked in via PrairieTest. Time limits and scheduling are managed by PrairieTest. Questions are hidden after completion.

### Override extending deadline for a student label

```json
{
  "accessControl": [
    {
      "dateControl": {
        "releaseDate": "2025-01-15T00:00:01",
        "dueDate": "2025-02-15T23:59:59",
        "durationMinutes": 60
      },
      "afterComplete": {
        "hideQuestions": true,
        "showQuestionsAgainDate": "2025-03-01T00:00:01"
      }
    },
    {
      "labels": ["Extended time"],
      "dateControl": {
        "dueDate": "2025-02-22T23:59:59",
        "durationMinutes": 90
      }
    }
  ]
}
```

Students with the "Extended time" label get a later due date (Feb 22 instead of Feb 15) and more time (90 minutes instead of 60). All other settings — release date, `afterComplete` configuration — are inherited from the defaults.

## Migration from legacy `allowAccess`

Migration from the legacy `allowAccess` format to the modern `accessControl` format can be done in two ways:

- On the **Assessment Access** tab, click **Migrate to modern format**.
- When **copying a course instance**, migration happens automatically.

Below are common legacy patterns and their modern equivalents.

### Single deadline

=== "Legacy `allowAccess`"

    ```json
    {
      "allowAccess": [
        {
          "startDate": "2025-01-15T00:00:01",
          "endDate": "2025-02-15T23:59:59",
          "credit": 100
        }
      ]
    }
    ```

=== "Modern `accessControl`"

    ```json
    {
      "accessControl": [
        {
          "dateControl": {
            "releaseDate": "2025-01-15T00:00:01",
            "dueDate": "2025-02-15T23:59:59"
          }
        }
      ]
    }
    ```

### Declining credit

=== "Legacy `allowAccess`"

    ```json
    {
      "allowAccess": [
        {
          "startDate": "2025-01-15T00:00:01",
          "endDate": "2025-02-01T23:59:59",
          "credit": 110
        },
        {
          "startDate": "2025-01-15T00:00:01",
          "endDate": "2025-02-15T23:59:59",
          "credit": 100
        },
        {
          "startDate": "2025-01-15T00:00:01",
          "endDate": "2025-02-22T23:59:59",
          "credit": 80
        }
      ]
    }
    ```

=== "Modern `accessControl`"

    ```json
    {
      "accessControl": [
        {
          "dateControl": {
            "releaseDate": "2025-01-15T00:00:01",
            "dueDate": "2025-02-15T23:59:59",
            "earlyDeadlines": [
              { "date": "2025-02-01T23:59:59", "credit": 110 }
            ],
            "lateDeadlines": [
              { "date": "2025-02-22T23:59:59", "credit": 80 }
            ]
          }
        }
      ]
    }
    ```

### Timed exam

=== "Legacy `allowAccess`"

    ```json
    {
      "allowAccess": [
        {
          "startDate": "2025-03-10T09:00:00",
          "endDate": "2025-03-10T11:00:00",
          "timeLimitMin": 90,
          "credit": 100
        }
      ]
    }
    ```

=== "Modern `accessControl`"

    ```json
    {
      "accessControl": [
        {
          "dateControl": {
            "releaseDate": "2025-03-10T09:00:00",
            "dueDate": "2025-03-10T11:00:00",
            "durationMinutes": 90
          }
        }
      ]
    }
    ```

### PrairieTest exam

=== "Legacy `allowAccess`"

    ```json
    {
      "allowAccess": [
        {
          "examUuid": "5719ebfe-ad20-42b1-b0dc-c47f0f714871",
          "credit": 100
        }
      ]
    }
    ```

=== "Modern `accessControl`"

    ```json
    {
      "accessControl": [
        {
          "integrations": {
            "prairieTest": {
              "exams": [
                { "examUuid": "5719ebfe-ad20-42b1-b0dc-c47f0f714871" }
              ]
            }
          }
        }
      ]
    }
    ```

### Password-gated exam

=== "Legacy `allowAccess`"

    ```json
    {
      "allowAccess": [
        {
          "startDate": "2025-03-10T09:00:00",
          "endDate": "2025-03-10T11:00:00",
          "password": "mysecret",
          "credit": 100
        }
      ]
    }
    ```

=== "Modern `accessControl`"

    ```json
    {
      "accessControl": [
        {
          "dateControl": {
            "releaseDate": "2025-03-10T09:00:00",
            "dueDate": "2025-03-10T11:00:00",
            "password": "mysecret"
          }
        }
      ]
    }
    ```

### Hide questions after close

=== "Legacy `allowAccess`"

    ```json
    {
      "allowAccess": [
        {
          "startDate": "2025-01-15T00:00:01",
          "endDate": "2025-02-15T23:59:59",
          "showClosedAssessment": false,
          "credit": 100
        },
        {
          "active": false,
          "showClosedAssessment": false
        }
      ]
    }
    ```

=== "Modern `accessControl`"

    ```json
    {
      "accessControl": [
        {
          "dateControl": {
            "releaseDate": "2025-01-15T00:00:01",
            "dueDate": "2025-02-15T23:59:59"
          },
          "afterComplete": {
            "hideQuestions": true
          }
        }
      ]
    }
    ```

### Hide score

=== "Legacy `allowAccess`"

    ```json
    {
      "allowAccess": [
        {
          "startDate": "2025-01-15T00:00:01",
          "endDate": "2025-02-15T23:59:59",
          "showClosedAssessmentScore": false,
          "credit": 100
        },
        {
          "active": false,
          "showClosedAssessmentScore": false
        }
      ]
    }
    ```

=== "Modern `accessControl`"

    ```json
    {
      "accessControl": [
        {
          "dateControl": {
            "releaseDate": "2025-01-15T00:00:01",
            "dueDate": "2025-02-15T23:59:59"
          },
          "afterComplete": {
            "hideScore": true
          }
        }
      ]
    }
    ```

### Always open (no deadlines)

=== "Legacy `allowAccess`"

    ```json
    {
      "allowAccess": [
        {
          "credit": 100
        }
      ]
    }
    ```

=== "Modern `accessControl`"

    ```json
    {
      "accessControl": [
        {
          "dateControl": {
            "releaseDate": "1970-01-01T00:00:00",
            "dueDate": "2099-12-31T23:59:59"
          }
        }
      ]
    }
    ```

    A `releaseDate` in the past and a `dueDate` far in the future ensures the assessment is always open with 100% credit. Without a `dateControl`, the assessment is listed but not active — students cannot start it or submit answers.

### View-only after close

=== "Legacy `allowAccess`"

    ```json
    {
      "allowAccess": [
        {
          "startDate": "2025-01-15T00:00:01",
          "endDate": "2025-02-15T23:59:59",
          "credit": 100
        },
        {
          "startDate": "2025-02-16T00:00:01",
          "active": false
        }
      ]
    }
    ```

=== "Modern `accessControl`"

    ```json
    {
      "accessControl": [
        {
          "dateControl": {
            "releaseDate": "2025-01-15T00:00:01",
            "dueDate": "2025-02-15T23:59:59",
            "afterLastDeadline": {
              "allowSubmissions": true,
              "credit": 0
            }
          }
        }
      ]
    }
    ```

!!! note

    UID-based rules from the legacy system (the `uids` field) don't have a direct JSON equivalent in the modern format. Use [student labels](#student-labels-and-overrides) or individual enrollment overrides (configured via the UI on the Assessment Access tab) instead.

## Staff access

Course staff (anyone with a course role of Previewer or above, or a course instance role of Student Data Viewer or above) always receive full access to all assessments regardless of access control rules. They see 100% credit with a "(Staff override)" indicator.
