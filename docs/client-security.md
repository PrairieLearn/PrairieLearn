# Client security

## Setup

Testing works best with ngrok. Set up a reserved wildcard domain like `*.my-prairielearn.ngrok.io`.

## Configuration

Add the following to your `config.json`:

```json
{
  "serverCanonicalHost": "https://my-prairielearn.ngrok.io",
  "trustProxy": true
}
```
