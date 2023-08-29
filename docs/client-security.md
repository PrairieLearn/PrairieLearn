# Client security

## Testing and development

To test this scheme locally without the need to either spin up a bunch of cloud resources or configure local domain names, you can use [ngrok](https://ngrok.com) to create tunnels to localhost.

### Setup

You'll need to create two reserved domains on https://dashboard.ngrok.com/cloud-edge/domains, substituting `my-prairielearn` with an available subdomain.

- `my-prairielearn.ngrok.io`
- `*.my-prairielearn.ngrok.io`

### Configuration

Add the following to your `config.json`, substituting `my-prairielearn` with the subdomain you used above:

```json
{
  "serverCanonicalHost": "https://my-prairielearn.ngrok.io",
  "trustProxy": true,
  "serveUntrustedContentFromSubdomains": true
}
```

### Running

Open up two ngrok tunnels in separate terminals, substituting `my-prairielearn` with the subdomain you used above:

```sh
ngrok http --region us --hostname my-prairielearn.ngrok.io 3000
ngrok http --region us --hostname "*.my-prairielearn.ngrok.io" 3000
```

Start PrairieLearn:

```sh
make start
```

You can now open https://my-prairielearn.ngrok.io in your browser.
