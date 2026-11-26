'use strict';
// Samples for the demo and the tests. "chatgpt" is the list of Google scopes that
// OpenAI publishes for ChatGPT's Google apps (help.openai.com/en/articles/10408842,
// read 2026-11-26). The others are invented: example.com addresses and a zero client ID.
(function (root) {
  var S = {
    chatgpt: [
      'Google scopes requested by ChatGPT (as published by OpenAI)',
      'Gmail: https://www.googleapis.com/auth/gmail.modify',
      'Google Calendar: https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/meetings.space.readonly',
      'Google BigQuery: https://www.googleapis.com/auth/bigquery https://www.googleapis.com/auth/bigquery.readonly https://www.googleapis.com/auth/bigquery.insertdata',
      'Google Contacts: https://www.googleapis.com/auth/contacts.readonly https://www.googleapis.com/auth/contacts.other.readonly',
      'Google Drive: https://www.googleapis.com/auth/drive.readonly https://www.googleapis.com/auth/drive.metadata.readonly https://www.googleapis.com/auth/drive.activity.readonly https://www.googleapis.com/auth/drive',
      'Google Docs: https://www.googleapis.com/auth/documents https://www.googleapis.com/auth/documents.readonly',
      'Google Sheets: https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/spreadsheets.readonly',
      'Google Slides: https://www.googleapis.com/auth/presentations https://www.googleapis.com/auth/presentations.readonly'
    ].join('\n'),
    n8n: [
      '# Google OAuth2 credential for an "AI inbox assistant" workflow (invented)',
      'Scope: https://mail.google.com/ https://www.googleapis.com/auth/drive https://www.googleapis.com/auth/calendar',
      '',
      'Consent link the credential opened:',
      'https://accounts.google.com/o/oauth2/v2/auth?client_id=000000000000-example.apps.googleusercontent.com&redirect_uri=https%3A%2F%2Fn8n.example.com%2Frest%2Foauth2-credential%2Fcallback&response_type=code&access_type=offline&prompt=consent&scope=https%3A%2F%2Fmail.google.com%2F%20https%3A%2F%2Fwww.googleapis.com%2Fauth%2Fdrive%20https%3A%2F%2Fwww.googleapis.com%2Fauth%2Fcalendar'
    ].join('\n'),
    outlook: [
      '# Consent link of an invented "email agent" for Microsoft 365',
      'https://login.microsoftonline.com/common/oauth2/v2.0/authorize?client_id=00000000-0000-0000-0000-000000000000&response_type=code&redirect_uri=https%3A%2F%2Fagent.example.com%2Fcallback&scope=openid%20profile%20offline_access%20User.Read%20Mail.ReadWrite%20Mail.Send%20Files.ReadWrite.All%20Calendars.ReadWrite'
    ].join('\n'),
    tidy: 'openid email https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/calendar.freebusy'
  };
  if (typeof module === 'object' && module.exports) module.exports = S; else root.LLAVERO_SAMPLES = S;
})(typeof window !== 'undefined' ? window : this);
