# Authentication

PrairieLearn currently uses [Google OAuth 2](#google-oauth-2) as its only supported method of user authentication for self-hosted PrairieLearn instances. While [LTI 1.1](../courseInstance/index.md#lti-support) is also available, it is currently deprecated and should be avoided for new deployments. [LTI 1.3](../lti13.md) is supported for interoperability with learning management systems, but not as an authentication method.

!!! note "SAML and Azure authentication"

    Authentication using SAML or Azure are available only as enterprise features, and are not supported in self-hosted PrairieLearn instances. If you are interested in these features, please visit <https://www.prairielearn.com> for information about paid hosting and enterprise support.

## Google OAuth 2

To start, create a [Google Cloud account](https://cloud.google.com/) and then:

- Click [console](https://console.cloud.google.com/) to log in to your console.
- Create a project then go to [APIs & Services](https://console.cloud.google.com/apis/dashboard).
  - Go to `OAuth consent screen` and complete the consent form.
  - Proceed to `Credentials` and create a new `OAuth client ID`.
  - Select `Web application`.
  - Under Authorized JavaScript origins, click `ADD URI` and add your domain.
  - Under Authorized redirect URIs, click `ADD URI` and add `https://yourdomain.com/pl/oauth2callback` which is the route to the Google OAuth callback.
  - Click `Create` which will give you a `Client ID` and a `Client Secret`. **Keep these values secret.**

Now add the keys to `config.json`:

```json title="config.json"
{
  "googleClientId": "Your Client ID key",
  "googleClientSecret": "Your Client Secret key",
  "googleRedirectUrl": "https://yourdomain.com/pl/oauth2callback",
  "hasOauth": true
}
```

You should now be able to use Google to log in to your PrairieLearn instance.
