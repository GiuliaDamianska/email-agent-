'use strict';

require('dotenv').config();
const { google } = require('googleapis');

const SCOPES = ['https://www.googleapis.com/auth/gmail.modify'];

function createOAuth2Client() {
  return new google.auth.OAuth2(
    process.env.GMAIL_CLIENT_ID,
    process.env.GMAIL_CLIENT_SECRET,
    process.env.GMAIL_REDIRECT_URI || 'http://localhost'
  );
}

async function authorize() {
  const client = createOAuth2Client();

  if (!process.env.GMAIL_REFRESH_TOKEN) {
    const authUrl = client.generateAuthUrl({ access_type: 'offline', scope: SCOPES });
    console.log('\nNo GMAIL_REFRESH_TOKEN found. Steps to authorize:\n');
    console.log('1. Visit this URL:\n');
    console.log('   ' + authUrl);
    console.log('\n2. After approving, copy the `code` from the redirect URL.');
    console.log('3. Run:  node auth.js <code>\n');
    process.exit(1);
  }

  client.setCredentials({ refresh_token: process.env.GMAIL_REFRESH_TOKEN });
  return client;
}

async function exchangeCode(code) {
  const client = createOAuth2Client();
  const { tokens } = await client.getToken(code);
  console.log('\nAdd this to your .env file:\n');
  console.log('GMAIL_REFRESH_TOKEN=' + tokens.refresh_token);
  console.log();
}

// node auth.js <code>
if (require.main === module) {
  const code = process.argv[2];
  if (!code) {
    console.error('Usage: node auth.js <authorization_code>');
    process.exit(1);
  }
  exchangeCode(code).catch(console.error);
}

module.exports = { authorize };
