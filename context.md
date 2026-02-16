# pl-drawing labels not rendering on Safari ≤17

## Problem

After the MathJax 3.2.2 → 4.1.0 upgrade (Jan 17 2026, `5c47fa63cf`), pl-drawing
labels stopped rendering on Safari ≤17 / WebKit ≤17.4. All label types were affected
(pl-vector, pl-circle, pl-dimensions, pl-arc-dimensions). Drawing shapes (circles,
vectors, lines) still rendered correctly since they don't go through the MathJax
pipeline.

Reported by multiple instructors in `#pl-help` starting Feb 3 2026:
- https://prairielearn.slack.com/archives/C266KEH9A/p1770137573435919
- https://prairielearn.slack.com/archives/C266KEH9A/p1771020501693639

Affected users were primarily on iPad (Safari), but also seen on Mac. The PrairieLearn
team and course staff could not reproduce the issue on their own devices (which ran
newer WebKit versions).

## Root cause

MathJax 4 added a Speech Rule Engine (SRE) that annotates SVG elements with
`data-semantic-speech` attributes containing raw SSML markup:

```
data-semantic-speech="<prosody pitch=&quot;+30%&quot;> <mark name=&quot;0&quot;/> <say-as interpret-as=&quot;character&quot;>Q</say-as> </prosody>"
```

The pl-drawing label pipeline serializes the MathJax SVG, base64-encodes it, and loads
it as a `data:image/svg+xml` Image. When loaded this way, browsers parse the SVG as
**XML** (not HTML).

The problem: `Element.outerHTML` uses **HTML serialization rules**, which don't require
escaping `<` inside attribute values. But in XML, `<` in attribute values **must** be
escaped as `&lt;`. Older WebKit versions (Safari ≤17) correctly reject this as malformed
XML when parsing the SVG image, causing the Image load to fail silently. Newer WebKit
(Safari 18+, WebKit 26) has a more lenient parser that tolerates it.

Since `gen_text()` in `mechanicsObjects.js` is async but called without `.catch()`,
the failure was completely silent — labels simply didn't appear.

## Reproduction

Reproduced using Playwright with WebKit 17.4 (via `playwright-core@1.40.0`). Test
files used during investigation are in `/tmp/mathjax-*.html`.

Key finding: the SVG has **8 attribute values with literal `<` / `>`** when serialized
with `outerHTML`, and **0** when serialized with `XMLSerializer`.

## Fix

Replace `svg.outerHTML` with `new XMLSerializer().serializeToString(svg)` in
`mechanicsObjects.js`. XMLSerializer produces valid XML with proper escaping of special
characters in attribute values.

This also makes the existing `NS\d+:href → xlink:href` Safari workaround unnecessary,
since XMLSerializer handles namespace serialization correctly. That workaround has been
removed.

## Upstream

This is also a MathJax issue: the SRE stores raw SSML inside SVG data attributes,
which makes the SVG output invalid when serialized with `outerHTML` and used standalone.
An upstream issue should be filed at https://github.com/mathjax/MathJax/issues.
