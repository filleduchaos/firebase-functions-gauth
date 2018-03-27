const functions = require('firebase-functions');
const admin = require('firebase-admin');
const { google } = require('googleapis');

admin.initializeApp(functions.config().firebase);
const gauthKeys = functions.config().gauth;
const googleScopes = [
  'https://www.googleapis.com/auth/calendar'
  // Add more scopes if you want! The full scope list is available at
  // https://developers.google.com/identity/protocols/googlescopes
];

const OAuth2 = google.auth.OAuth2;
const oauth2Client = new OAuth2(
  gauthKeys.client_id,
  gauthKeys.client_secret,
  // You can replace the domain here with a custom domain name if you have one
  `https://${process.env.GCLOUD_PROJECT}.firebaseapp.com/google-oauth2-callback`
);

// Change the database reference as you like. Don't forget to edit the database
// rules as well!
const tokenStore = admin.database().ref('__tokens__');

// Check that user is signed in
const checkAuthMiddleware = (req, res, next) => {
  const { idToken } = req.query;

  if (typeof idToken === 'string') {
    return admin.auth().verifyIdToken(idToken)
      .then((decodedIdToken) => {
        // If you want to store tokens under another key, retrieve and set it here
        req.userID = decodedIdToken.uid;
        return next();
      })
      .catch((err) => {
        console.error(err);
        return res.status(401);
      });
  }
  return res.statusCode(401);
};

exports.grantGooglePermissions = functions.https.onRequest((req, res) => (
  checkAuthMiddleware(req, res, () => {
    const url = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      // This will be passed to the OAuth callback 
      state: req.userID,
      // Remove this if you only want access to the user's profile and email
      scope: googleScopes,
    });
  
    return res.redirect(url);
  })
));

exports.googleOAuth2Callback = functions.https.onRequest((req, res) => {
  const { code, state: userID } = req.query;

  if (code && userID) {
    return oauth2Client.getToken(code)
      .then(({ tokens }) => {
        if (tokens && tokens.refresh_token) {
          return tokenStore.child(userID).set(tokens.refresh_token)
            .then(() => {
              console.log(`Got token for ${userID}`);
              return res.redirect('/success.html');
            });
        }

        return console.error(`Refresh token not found. No action taken.`);
      })
      .catch((err) => {
        console.error(err);
      });
  }
});
