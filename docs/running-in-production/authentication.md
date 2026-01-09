# Authentication

PrairieLearn currently has a few ways to do user authentication.

- [Google OAuth 2](#google-oauth-2)
- [LTI](../courseInstance/index.md#lti-overview)

## Google OAuth 2

To start, create a [Google Cloud account](https://cloud.google.com/) and then:

- Click [console](https://console.cloud.google.com/) to log in to your console.
- Create a project then got to [APIs & Services](https://console.cloud.google.com/apis/dashboard).
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

## LTI

Check out the [course instance LTI docs](../courseInstance/index.md#lti-overview) to learn more about LTI.
