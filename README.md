# firebase-functions-gauth

Proof-of-concept of getting offline access to various Google API scopes for a
serverless Firebase project.

## How to set up

You will need to have created a Firebase account and project, installed the
Firebase CLI and logged in from the command line.

- Clone the project and change into the project directory
- Edit the `.firebaserc` file to point the default project to your Firebase
  project.
- This demo uses anonymous authentication to capture users, so you'll have to
  enable that for your project (from the [Firebase console](https://console.firebase.google.com)).
  Alternatively, you can change to and enable whatever sign-in you want.
- You will need to obtain your Google project's credentials and register your
  OAuth callback.
  - Go to your [Google console](https://console.developers.google.com).
  - Make sure your Firebase project is the current selected project.
  - From the `APIs and Services` side menu, navigate to the Credentials page.
  - Under the `OAuth 2.0 client IDs` section, click on the web client that was
    auto created by Google.
  - Add the client ID and secret at the top of the page to your configuration
    with these commands:

    ```bash
    firebase functions:config:set gauth.client_id=YOUR_CLIENT_ID
    firebase functions:config:set gauth.client_secret=YOUR_CLIENT_SECRET
    ```

  - On the Google Developers' Console page, go to the Authorized Redirect URIs
    section and add `https://<PROJECT_ID>.firebaseapp.com/google-oauth2-callback`.
    - If you have your own domain connected to the project, don't forget to add
      `https://<YOUR_DOMAIN>/google-oauth2-callback` as well.
  - Save your changes
    - Optionally, you can go to the OAuth consent screen tab to customize the
      authorization screen that will be presented to users
  - From the command line, run `firebase deploy` to push the app live

That's it! :)

## How to use

- Navigate to your hosted project URL, sign in (if necessary) and grant Google
  permissions
- If you check your Firebase database, you should see a `__tokens__` ref that has
  a credentials object for your user ID (protected from non-admin read/write access)
- You can test the offline access by visiting `https://<YOUR_PROJECT_DOMAIN>/list-events?userID=<A_USER_ID>`.
  A list of the user's calendar events should be returned as a JSON if they have
  granted access previously.

## More

I might be turning this into a full-fledged library, so stay tuned!
