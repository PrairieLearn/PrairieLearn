# Authentication

PrairieLearn currently has a few ways to do user authentication.

- [Google OAuth 2](#google-oauth-2)
- [Azure](#azure)
- [Shibboleth](#shibboleth)
- [LTI](../courseInstance.md#lti-overview)

## Google OAuth 2

Take a look in `pages/authLoginOAuth2/authLoginOAuth2.js` and `pages/authCallbackOAuth2/authCallbackOAuth2.js` to get an idea of what variables you need to modify.

To start create a [Google Cloud account](https://cloud.google.com/) and then:

- Click [console](https://console.cloud.google.com/) to login to your console.
- Create a project then got to [APIs & Services](https://console.cloud.google.com/apis/dashboard).
  - Go to `OAuth consent screen` and complete the consent form.
  - Proceed to `Credentials` and create a new `OAuth client ID`.
  - Select `Web application`.
  - Under Authorized JavaScript origins, click `ADD URI` and add in your domain address.
  - Under Authorized redirect URIs, click `ADD URI` and add `https://yourdomain/pl/oauth2callback` which is the route to the Google OAuth callback.
  - Click `Create` which will give you a `Client ID` and a `Client Secret`. **WARNING: DO NOT UPLOAD THESE KEYS ANYWHERE**

Now add the keys to `config.json`:

```json
{
  "googleClientId": "Your Client ID key",
  "googleClientSecret": "Your Client Secret key",
  "googleRedirectUrl": "https://yourdomain/pl/oauth2callback",
  "hasOauth": true,
  "authType": "x-auth"
}
```

That's it, you should be up and running with Google OAuth 2!

## Azure

Take a look in `pages/authLoginAzure/authLoginAzure.js` and `pages/authCallbackAzure/authCallbackAzure.js` to get an idea of what variables you need to modify.

## Shibboleth

Take a look in `pages/authCallbackShib/authCallbackShib.js` to get a sense of what headers you will need your reverse proxy to pass.

## LTI

Check out the [course instance LTI docs](../courseInstance.md#lti-overview) to learn more about LTI.
