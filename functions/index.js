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

const getOAuthClient = () => new google.auth.OAuth2(
  gauthKeys.client_id,
  gauthKeys.client_secret,
  // You can replace the domain here with a custom domain name if you have one
  `https://${process.env.GCLOUD_PROJECT}.firebaseapp.com/google-oauth2-callback`
);
const calendarService = google.calendar('v3');

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
    const url = getOAuthClient().generateAuthUrl({
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
    return getOAuthClient().getToken(code)
      .then(({ tokens }) => {
        if (tokens) {
          return tokenStore.child(userID).update(tokens)
            .then(() => {
              console.log(`Got tokens for ${userID}`);
              return res.redirect('/success.html');
            });
        }

        return console.error(`No tokens returned. No action taken.`);
      })
      .catch((err) => {
        console.error(err);
        return res.statusCode(500);
      });
  }
});

exports.listPrimaryCalendarEvents = functions.https.onRequest((req, res) => {
  // You should probably be more secure about this! This is just a sample
  const { userID } = req.query;

  if (userID) {
    const userTokensRef = tokenStore.child(userID);
    return userTokensRef.once('value')
      .then(snapshot => snapshot.exists() && snapshot.val())
      .then(tokens => {
        if (tokens) {
          const oauth2Client = getOAuthClient();
          oauth2Client.setCredentials(tokens);
          return calendarService.events.list({
            auth: oauth2Client,
            calendarId: 'primary',
          }, (err, response) => {
            if (err) {
              console.error(err);
              return res.statusCode(500);
            }
            // Update tokens in database
            return userTokensRef.update(oauth2Client.credentials)
              .then(() => res.status(200).json(response));
          });
        }

        return res.status(403).json({ message: 'No tokens for this user' });
      })
      .catch((err) => {
        console.error(err);
        return res.statusCode(500);
      });
  }
});
