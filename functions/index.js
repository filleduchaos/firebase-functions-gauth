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
  return res.sendStatus(401);
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
        return res.sendStatus(500);
      });
  }
});

const MILLISECONDS_IN_DAY = 8.64e7;
const filterEvent = event => ({
  id: event.id,
  status: event.status,
  link: event.htmlLink,
  summary: event.summary,
  start: event.start.dateTime,
  end: event.end.dateTime,
  hangout: event.hangoutLink
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
          const now = new Date();
          const defaultOptions = {
            auth: oauth2Client,
            calendarId: 'primary',
            key: gauthKeys.server_api_key,
            orderBy: 'startTime',
            singleEvents: true,
            timeMax: (new Date(now.getTime() + 7*MILLISECONDS_IN_DAY)).toISOString(),
            timeMin: now.toISOString(),
          };

          const yieldEvents = (list = [], pageToken) => new Promise((resolve, reject) => {
            const options = pageToken ? Object.assign({}, defaultOptions, { pageToken }) : defaultOptions;
            calendarService.events.list(options, (err, { data }) => {
              if (err) {
                reject(err);
              } else {
                const newList = list.concat(data.items.map(filterEvent));
                if (data.nextPageToken) {
                  resolve(yieldEvents(newList, data.nextPageToken));
                } else {
                  resolve(newList);
                }
              }
            });
          });

          return yieldEvents()
            .then(eventsList => userTokensRef.update(oauth2Client.credentials)
              .then(() => res.status(200).json({ list: eventsList || [] })))
            .catch(err => { throw err });
        }

        return res.status(403).json({ message: 'No tokens for this user' });
      })
      .catch((err) => {
        console.error(err);
        return res.sendStatus(500);
      });
  } else {
    return res.status(400).json({ message: 'Please provide a user id' });
  }
});

const getRandomTimes = () => {
  const now = new Date();
  const date = new Date(
    now.getTime() +
    MILLISECONDS_IN_DAY +
    (Math.random() * 6 * MILLISECONDS_IN_DAY)
  );
  date.setUTCHours(0, 0, 0, 0);
  const startHour = Math.round(9 + (Math.random() * 10));
  date.setUTCHours(startHour);
  const start = date.toISOString();
  date.setUTCHours(startHour + 1);
  const end = date.toISOString();
  
  return { start, end };
};

exports.addPrivateStreamEvent = functions.https.onRequest((req, res) => {
  // You should probably be more secure about this! This is just a sample
  const { userID } = req.query;

  if (userID) {
    const userTokensRef = tokenStore.child(userID);

    return userTokensRef.once('value')
      .then(snapshot => snapshot.exists() && snapshot.val())
      .then(tokens => {
        if (tokens) {
          const times = getRandomTimes();
          const event = {
            summary: 'Tune in to my show!',
            description: "A private stream just for you.",
            start: {
              dateTime: times.start,
              timeZone: 'Africa/Lagos',
            },
            end: {
              dateTime: times.end,
              timeZone: 'Africa/Lagos',
            },
            reminders: {
              'useDefault': true,
            },
          };

          const oauth2Client = getOAuthClient();
          oauth2Client.setCredentials(tokens);

          return calendarService.events.insert({
            auth: oauth2Client,
            calendarId: 'primary',
            key: gauthKeys.server_api_key,
            resource: event,
          }, (err, { data: event }) => {
            if (err) {
              console.error(err);
              return res.sendStatus(500);
            }

            // Update tokens in database
            return res.status(201).json({ event: (event && filterEvent(event)) || {} });
          });
        }

        return res.status(403).json({ message: 'No tokens for this user' });
      })
      .catch((err) => {
        console.error(err);
        return res.sendStatus(500);
      });
  } else {
    return res.status(400).json({ message: 'Please provide a user id' });
  }
});
