#!/usr/bin/env node
'use strict';
// Llavero — what an AI agent can do with your Google or Microsoft account.
// Paste the permissions (OAuth scopes) an app asks for: scope lists, a consent
// URL, an n8n/Zapier credential, or the text of the consent screen. Offline,
// zero dependencies. Every official class and description is copied from the
// vendor pages listed in RESEARCH.md (read on 2026-11-26).
(function (root) {
  var isNode = typeof module === 'object' && module.exports;
  var GRAPH = isNode ? require('./graph-permissions.js') : root.LLAVERO_GRAPH;
  var VERSION = '1.0.0';
  var GA = 'https://www.googleapis.com/auth/';

  var DOC = {
    gmail: 'https://developers.google.com/workspace/gmail/api/auth/scopes',
    drive: 'https://developers.google.com/workspace/drive/api/guides/api-specific-auth',
    calendar: 'https://developers.google.com/workspace/calendar/api/auth',
    sheets: 'https://developers.google.com/workspace/sheets/api/scopes',
    docs: 'https://developers.google.com/workspace/docs/api/auth',
    slides: 'https://developers.google.com/workspace/slides/api/scopes',
    gid: 'https://developers.google.com/identity/protocols/oauth2/scopes',
    goffline: 'https://developers.google.com/identity/protocols/oauth2/web-server',
    gadmin: 'https://support.google.com/a/answer/7281227?hl=en',
    glinked: 'https://myaccount.google.com/linkedapps',
    glinkedHelp: 'https://support.google.com/accounts/answer/13533235?hl=en',
    graph: 'https://learn.microsoft.com/en-us/graph/permissions-reference',
    oidc: 'https://learn.microsoft.com/en-us/entra/identity-platform/scopes-oidc',
    consent: 'https://learn.microsoft.com/en-us/entra/identity-platform/permissions-consent-overview',
    myapps: 'https://support.microsoft.com/en-us/account-billing/edit-or-revoke-application-permissions-in-the-my-apps-portal-169be2b4-ee26-4338-aea8-d19bb2f329ee',
    owasp: 'https://genai.owasp.org/llmrisk/llm01-prompt-injection/'
  };

  // Capability tags -> plain words for the summary.
  var CAN = {
    mailRead: ['read your email', 'leer tu correo'],
    mailMeta: ['see who you write to and when', 'ver con quién te escribes y cuándo'],
    mailSend: ['send email as you', 'enviar correos en tu nombre'],
    mailDelete: ['delete email for good, skipping the trash', 'borrar correos para siempre, sin pasar por la papelera'],
    mailWrite: ['change, move and trash your email', 'cambiar, mover y mandar a la papelera tus correos'],
    settings: ['change your mail settings and filters', 'cambiar la configuración y los filtros de tu correo'],
    delegate: ['change who can manage your mailbox', 'cambiar quién puede administrar tu buzón'],
    filesRead: ['see and download your files', 'ver y descargar tus archivos'],
    filesWrite: ['change and delete your files', 'cambiar y borrar tus archivos'],
    share: ['change who your files or calendars are shared with', 'cambiar con quién se comparten tus archivos o calendarios'],
    calRead: ['see your calendar', 'ver tu calendario'],
    calWrite: ['create, change and delete calendar events', 'crear, cambiar y borrar eventos del calendario'],
    contactsRead: ['see your contacts', 'ver tus contactos'],
    contactsWrite: ['change and delete your contacts', 'cambiar y borrar tus contactos'],
    msgRead: ['read your Teams chats', 'leer tus chats de Teams'],
    msgSend: ['send Teams messages as you', 'enviar mensajes de Teams en tu nombre'],
    directory: ['see your company\'s people and groups', 'ver las personas y los grupos de tu empresa'],
    admin: ['change your company\'s users, groups, apps or roles', 'cambiar usuarios, grupos, aplicaciones o roles de tu empresa'],
    scripts: ['change how your Apps Script projects behave', 'cambiar cómo funcionan tus proyectos de Apps Script'],
    tasks: ['create, change and delete your tasks', 'crear, cambiar y borrar tus tareas'],
    notes: ['read, change and share your OneNote notebooks', 'leer, cambiar y compartir tus cuadernos de OneNote']
  };

  // Google: [short, service, doc, class, power, tags, official description(s), en, es, alt, fix]
  // class: Google's own label on the API scope page (null = the page publishes none).
  // power: Llavero's own rating of what the scope allows (high / medium / low).
  var GROWS = [
    // Gmail (DOC.gmail): tables "Non-sensitive", "Sensitive", "Restricted"
    ['https://mail.google.com/', 'Gmail', 'gmail', 'restricted', 'high', 'mailRead mailSend mailDelete mailWrite settings', ['Read, compose, send, and permanently delete all your email from Gmail'],
      'Everything in your Gmail: read, write, send and delete email for good, skipping the trash. Google says to ask for it only to delete permanently.', 'Todo tu Gmail: leer, escribir, enviar y borrar correos para siempre, sin pasar por la papelera. Google dice que solo se pida para borrar de forma permanente.', ['gmail.modify', 'gmail.readonly'], true],
    ['gmail.modify', 'Gmail', 'gmail', 'restricted', 'high', 'mailRead mailSend mailWrite', ['Read, compose, and send emails from your Gmail account'],
      'Read all your email, write and send email as you, and move messages to the trash. It cannot delete permanently.', 'Leer todo tu correo, escribir y enviar correos en tu nombre y mandar mensajes a la papelera. No puede borrar de forma permanente.', ['gmail.readonly']],
    ['gmail.readonly', 'Gmail', 'gmail', 'restricted', 'medium', 'mailRead', ['View your email messages and settings'],
      'Read all your email and your settings. It cannot send or change anything.', 'Leer todo tu correo y tu configuración. No puede enviar ni cambiar nada.', ['gmail.metadata']],
    ['gmail.compose', 'Gmail', 'gmail', 'restricted', 'high', 'mailSend', ['Manage drafts and send emails'],
      'Create and change drafts and send them: it can send email as you.', 'Crear y cambiar borradores y enviarlos: puede enviar correos en tu nombre.', []],
    ['gmail.send', 'Gmail', 'gmail', 'sensitive', 'high', 'mailSend', ['Send email on your behalf'],
      'Send email as you. It cannot read your inbox.', 'Enviar correos en tu nombre. No puede leer tu bandeja.', []],
    ['gmail.insert', 'Gmail', 'gmail', 'restricted', 'medium', 'mailWrite', ['Add emails into your Gmail mailbox'],
      'Add messages into your mailbox.', 'Agregar mensajes a tu buzón.', []],
    ['gmail.metadata', 'Gmail', 'gmail', 'restricted', 'medium', 'mailMeta', ['View your email message metadata such as labels and headers, but not the email body'],
      'See labels and headers (who wrote, to whom, when, the subject), not the message body.', 'Ver etiquetas y encabezados (quién escribió, a quién, cuándo, el asunto), no el cuerpo del mensaje.', []],
    ['gmail.labels', 'Gmail', 'gmail', 'non-sensitive', 'low', '', ['See and edit your email labels'],
      'See and edit your labels.', 'Ver y editar tus etiquetas.', []],
    ['gmail.settings.basic', 'Gmail', 'gmail', 'restricted', 'high', 'settings', ['See, edit, create, or change your email settings and filters in Gmail'],
      'Change your Gmail settings and filters. Filters decide what happens to the email you receive.', 'Cambiar tu configuración y tus filtros de Gmail. Los filtros deciden qué pasa con el correo que recibes.', []],
    ['gmail.settings.sharing', 'Gmail', 'gmail', 'restricted', 'high', 'settings delegate', ['Manage your sensitive mail settings, including who can manage your mail'],
      'Change who can manage your mail. Google says it is for administrative use only, through a service account with domain-wide delegation. An assistant should not need it.', 'Cambiar quién puede administrar tu correo. Google dice que es solo para uso administrativo, con una cuenta de servicio con delegación de todo el dominio. Un asistente no debería necesitarlo.', [], true],
    ['gmail.addons.current.action.compose', 'Gmail', 'gmail', 'non-sensitive', 'low', '', ['Manage drafts and send emails when you interact with the Google Workspace add-on'],
      'Write drafts and send email only while you use the add-on.', 'Escribir borradores y enviar correos solo mientras usas el complemento.', []],
    ['gmail.addons.current.message.action', 'Gmail', 'gmail', 'non-sensitive', 'low', '', ['View your email messages when you interact with the add-on'],
      'See the email you have open while you use the add-on.', 'Ver el correo que tienes abierto mientras usas el complemento.', []],
    ['gmail.addons.current.message.metadata', 'Gmail', 'gmail', 'sensitive', 'low', '', ['View your email message metadata when the add-on is running'],
      'See the headers of the email you have open while the add-on runs.', 'Ver los encabezados del correo abierto mientras el complemento funciona.', []],
    ['gmail.addons.current.message.readonly', 'Gmail', 'gmail', 'sensitive', 'low', '', ['View your email messages when the add-on is running'],
      'See the email you have open while the add-on runs.', 'Ver el correo abierto mientras el complemento funciona.', []],
    // Drive (DOC.drive)
    ['drive', 'Google Drive', 'drive', 'restricted', 'high', 'filesRead filesWrite share', ['View and manage all your Drive files', 'See, edit, create, and delete all of your Google Drive files'],
      'See, change, share and delete every file in your Drive.', 'Ver, cambiar, compartir y borrar todos los archivos de tu Drive.', ['drive.file']],
    ['drive.readonly', 'Google Drive', 'drive', 'restricted', 'medium', 'filesRead', ['View and download all your Drive files', 'See and download all your Google Drive files'],
      'See and download every file in your Drive.', 'Ver y descargar todos los archivos de tu Drive.', ['drive.file']],
    ['drive.metadata', 'Google Drive', 'drive', 'restricted', 'medium', '', ['View and manage metadata of files in your Drive'],
      'See and change the details of all your files (names, dates and other properties), not their contents.', 'Ver y cambiar los datos de todos tus archivos (nombres, fechas y otras propiedades), no su contenido.', ['drive.file']],
    ['drive.metadata.readonly', 'Google Drive', 'drive', 'restricted', 'medium', '', ['View metadata for files in your Drive'],
      'See the names and other details of all your files, not their contents.', 'Ver los nombres y otros datos de todos tus archivos, no su contenido.', ['drive.file']],
    ['drive.activity', 'Google Drive', 'drive', 'restricted', 'medium', '', ['View and add to the activity record of files in your Drive'],
      'See and add to the activity record of your files.', 'Ver y agregar al registro de actividad de tus archivos.', []],
    ['drive.activity.readonly', 'Google Drive', 'drive', 'restricted', 'medium', '', ['View the activity record of files in your Drive'],
      'See the activity record of your files.', 'Ver el registro de actividad de tus archivos.', []],
    ['drive.meet.readonly', 'Google Drive', 'drive', 'restricted', 'medium', 'filesRead', ['View Drive files created or edited by Google Meet'],
      'See the Drive files that Google Meet created or edited.', 'Ver los archivos de Drive que creó o editó Google Meet.', []],
    ['drive.scripts', 'Google Drive', 'drive', 'restricted', 'high', 'scripts', ['Modify your Google Apps Script scripts\' behavior'],
      'Change how your Apps Script scripts behave.', 'Cambiar cómo se comportan tus scripts de Apps Script.', []],
    ['drive.file', 'Google Drive', 'drive', 'non-sensitive', 'low', '', ['Create new Drive files, or modify existing files, that you open with an app or that the user shares with an app while using the Google Picker API or the app\'s file picker', 'See, edit, create, and delete only the specific Google Drive files you use with this app'],
      'Only the files you create with this app, open with it or pick for it. Google recommends this one.', 'Solo los archivos que creas con esta aplicación, abres con ella o eliges para ella. Es el que Google recomienda.', []],
    ['drive.appdata', 'Google Drive', 'drive', 'non-sensitive', 'low', '', ['View and manage the app\'s own configuration data in your Google Drive'],
      'Only the app\'s own settings folder in your Drive.', 'Solo la carpeta de configuración de la propia aplicación en tu Drive.', []],
    ['drive.appfolder', 'Google Drive', 'drive', 'non-sensitive', 'low', '', [],
      'Only the app\'s own settings folder in your Drive.', 'Solo la carpeta de configuración de la propia aplicación en tu Drive.', []],
    ['drive.install', 'Google Drive', 'drive', 'non-sensitive', 'low', '', ['Allow apps to appear as an option in the "Open with" or the "New" menu'],
      'Appear in Drive\'s "Open with" and "New" menus.', 'Aparecer en los menús «Abrir con» y «Nuevo» de Drive.', []],
    ['drive.apps.readonly', 'Google Drive', 'drive', 'sensitive', 'low', '', ['View apps authorized to access your Drive'],
      'See which apps can access your Drive.', 'Ver qué aplicaciones pueden acceder a tu Drive.', []],
    // Sheets, Docs, Slides (DOC.sheets / DOC.docs / DOC.slides)
    ['spreadsheets', 'Google Sheets', 'sheets', 'sensitive', 'high', 'filesRead filesWrite', ['See, edit, create, and delete all your Google Sheets spreadsheets'],
      'See, change, create and delete all your spreadsheets.', 'Ver, cambiar, crear y borrar todas tus hojas de cálculo.', ['drive.file']],
    ['spreadsheets.readonly', 'Google Sheets', 'sheets', 'sensitive', 'medium', 'filesRead', ['See all your Google Sheets spreadsheets'],
      'See all your spreadsheets.', 'Ver todas tus hojas de cálculo.', ['drive.file']],
    ['documents', 'Google Docs', 'docs', 'sensitive', 'high', 'filesRead filesWrite', ['See, edit, create, and delete all your Google Docs documents'],
      'See, change, create and delete all your documents.', 'Ver, cambiar, crear y borrar todos tus documentos.', ['drive.file']],
    ['documents.readonly', 'Google Docs', 'docs', 'sensitive', 'medium', 'filesRead', ['See all your Google Docs documents'],
      'See all your documents.', 'Ver todos tus documentos.', ['drive.file']],
    ['presentations', 'Google Slides', 'slides', 'sensitive', 'high', 'filesRead filesWrite', ['See, edit, create, and delete all your Google Slides presentations'],
      'See, change, create and delete all your presentations.', 'Ver, cambiar, crear y borrar todas tus presentaciones.', ['drive.file']],
    ['presentations.readonly', 'Google Slides', 'slides', 'sensitive', 'medium', 'filesRead', ['See all your Google Slides presentations'],
      'See all your presentations.', 'Ver todas tus presentaciones.', ['drive.file']],
    // Calendar (DOC.calendar): the page publishes no sensitivity class.
    ['calendar', 'Google Calendar', 'calendar', null, 'high', 'calRead calWrite share', ['See, edit, share, and permanently delete all the calendars you can access using Google Calendar'],
      'See, change, share and permanently delete every calendar you can access.', 'Ver, cambiar, compartir y borrar para siempre todos los calendarios a los que tienes acceso.', ['calendar.events', 'calendar.freebusy']],
    ['calendar.readonly', 'Google Calendar', 'calendar', null, 'medium', 'calRead', ['See and download any calendar you can access using your Calendar'],
      'See and download every calendar you can access.', 'Ver y descargar todos los calendarios a los que tienes acceso.', ['calendar.freebusy']],
    ['calendar.events', 'Google Calendar', 'calendar', null, 'medium', 'calRead calWrite', ['View and edit events on all your calendars'],
      'See and change the events on all your calendars.', 'Ver y cambiar los eventos de todos tus calendarios.', ['calendar.events.owned', 'calendar.freebusy']],
    ['calendar.events.readonly', 'Google Calendar', 'calendar', null, 'medium', 'calRead', ['View events on all your calendars'],
      'See the events on all your calendars.', 'Ver los eventos de todos tus calendarios.', ['calendar.freebusy']],
    ['calendar.events.owned', 'Google Calendar', 'calendar', null, 'medium', 'calRead calWrite', ['See, create, change, and delete events on Google calendars you own'],
      'See, create, change and delete events on the calendars you own.', 'Ver, crear, cambiar y borrar eventos de los calendarios que son tuyos.', []],
    ['calendar.events.owned.readonly', 'Google Calendar', 'calendar', null, 'medium', 'calRead', ['See the events on Google calendars you own'],
      'See the events on the calendars you own.', 'Ver los eventos de los calendarios que son tuyos.', []],
    ['calendar.freebusy', 'Google Calendar', 'calendar', null, 'low', '', ['View your availability in your calendars'],
      'Only when you are free or busy.', 'Solo cuándo estás libre u ocupado.', []],
    ['calendar.events.freebusy', 'Google Calendar', 'calendar', null, 'low', '', ['See the availability on Google calendars you have access to'],
      'Only when calendars you can access are free or busy.', 'Solo cuándo están libres u ocupados los calendarios a los que tienes acceso.', []],
    ['calendar.settings.readonly', 'Google Calendar', 'calendar', null, 'low', '', ['View your Calendar settings'],
      'See your Calendar settings.', 'Ver tu configuración de Calendar.', []],
    ['calendar.app.created', 'Google Calendar', 'calendar', null, 'low', '', ['Make secondary Google calendars, and see, create, change, and delete events on them'],
      'Only calendars the app creates itself.', 'Solo los calendarios que crea la propia aplicación.', []],
    ['calendar.calendarlist', 'Google Calendar', 'calendar', null, 'low', '', ['See, add, and remove Google calendars you\'re subscribed to'],
      'See, add and remove the calendars you are subscribed to.', 'Ver, agregar y quitar los calendarios a los que estás suscrito.', []],
    ['calendar.calendarlist.readonly', 'Google Calendar', 'calendar', null, 'low', '', ['See the list of Google calendars you\'re subscribed to'],
      'See the list of calendars you are subscribed to.', 'Ver la lista de calendarios a los que estás suscrito.', []],
    ['calendar.calendars', 'Google Calendar', 'calendar', null, 'medium', '', ['See and change the properties of Google calendars you have access to, and create secondary calendars'],
      'See and change the properties of your calendars and create new ones.', 'Ver y cambiar las propiedades de tus calendarios y crear otros.', []],
    ['calendar.calendars.readonly', 'Google Calendar', 'calendar', null, 'low', '', ['See the title, description, default time zone, and other properties of Google calendars you have access to'],
      'See the title, description and time zone of your calendars.', 'Ver el título, la descripción y la zona horaria de tus calendarios.', []],
    ['calendar.acls', 'Google Calendar', 'calendar', null, 'high', 'share', ['See and change the sharing permissions of Google calendars you own'],
      'Change who your calendars are shared with.', 'Cambiar con quién se comparten tus calendarios.', ['calendar.acls.readonly']],
    ['calendar.acls.readonly', 'Google Calendar', 'calendar', null, 'low', '', ['See the sharing permissions of Google calendars you own'],
      'See who your calendars are shared with.', 'Ver con quién se comparten tus calendarios.', []],
    ['calendar.events.public.readonly', 'Google Calendar', 'calendar', null, 'low', '', ['See the events on public calendars'],
      'See events on public calendars.', 'Ver eventos de calendarios públicos.', []],
    ['calendar.addons.execute', 'Google Calendar', 'calendar', null, 'low', '', ['Run as a Calendar add-on'], 'Run as a Calendar add-on.', 'Funcionar como complemento de Calendar.', []],
    ['calendar.addons.current.event.read', 'Google Calendar', 'calendar', null, 'low', '', ['See the events you open in Google Calendar'], 'See the event you have open.', 'Ver el evento que tienes abierto.', []],
    ['calendar.addons.current.event.write', 'Google Calendar', 'calendar', null, 'low', '', ['Edit the events you open in Google Calendar'], 'Edit the event you have open.', 'Editar el evento que tienes abierto.', []],
    // Sign-in (DOC.gid)
    ['openid', 'Sign-in', 'gid', null, 'low', '', ['Associate you with your personal info on Google'], 'Know that it is you (sign-in).', 'Saber que eres tú (inicio de sesión).', []],
    ['email', 'Sign-in', 'gid', null, 'low', '', ['See your primary Google Account email address'], 'See your email address.', 'Ver tu dirección de correo.', []],
    ['profile', 'Sign-in', 'gid', null, 'low', '', ['See your personal info, including any personal info you\'ve made publicly available'], 'See your name, photo and public profile.', 'Ver tu nombre, tu foto y tu perfil público.', []]
  ];

  // Gmail and Drive/Docs scopes on Google's admin "high-risk OAuth scopes" lists (DOC.gadmin).
  var G_HIGH_RISK = ('https://mail.google.com/ gmail.compose gmail.insert gmail.metadata gmail.modify gmail.readonly gmail.send gmail.settings.basic gmail.settings.sharing ' +
    'documents documents.readonly drive drive.activity drive.activity.readonly drive.apps.readonly drive.meet.readonly drive.metadata drive.metadata.readonly drive.readonly drive.scripts ' +
    'presentations presentations.readonly spreadsheets spreadsheets.readonly').split(' ');

  var GOOGLE = {}, GOOGLE_BY_DESC = [];
  GROWS.forEach(function (r) {
    var key = /^https:|^(openid|email|profile)$/.test(r[0]) ? r[0] : GA + r[0];
    var e = { provider: 'google', key: key, short: r[0].replace(GA, ''), service: r[1], doc: DOC[r[2]], cls: r[3], power: r[4], tags: (typeof r[5] === 'string' ? r[5] : '').split(' ').filter(Boolean), official: r[6][0] || '', en: r[7], es: r[8], alt: r[9] || [], fix: !!r[10], highRisk: G_HIGH_RISK.indexOf(r[0]) >= 0 };
    GOOGLE[key] = e;
    r[6].forEach(function (d) { GOOGLE_BY_DESC.push([norm(d), key]); });
  });

  // Microsoft: plain words, Llavero's rating, tags and narrower choice. Official
  // display text and admin consent come from graph-permissions.js.
  var MROWS = {
    'Mail.Read': ['medium', 'mailRead', 'Read your mailbox.', 'Leer tu buzón.', ['Mail.ReadBasic']],
    'Mail.ReadBasic': ['medium', 'mailMeta', 'Read your email without the body or attachments (sender, subject, dates).', 'Leer tus correos sin el cuerpo ni los adjuntos (remitente, asunto, fechas).', []],
    'Mail.ReadWrite': ['high', 'mailRead mailWrite', 'Read, create, change and delete your email. It cannot send.', 'Leer, crear, cambiar y borrar tus correos. No puede enviar.', ['Mail.Read']],
    'Mail.Send': ['high', 'mailSend', 'Send email as you.', 'Enviar correos en tu nombre.', []],
    'Mail.Read.Shared': ['medium', 'mailRead', 'Read your email and the shared mailboxes you can open.', 'Leer tu correo y los buzones compartidos que puedes abrir.', ['Mail.Read']],
    'Mail.ReadWrite.Shared': ['high', 'mailRead mailWrite', 'Read, change and delete your email and the shared mailboxes you can open.', 'Leer, cambiar y borrar tu correo y los buzones compartidos que puedes abrir.', ['Mail.ReadWrite']],
    'Mail.Send.Shared': ['high', 'mailSend', 'Send email as you and on behalf of others.', 'Enviar correos en tu nombre y en nombre de otras personas.', ['Mail.Send']],
    'MailboxSettings.ReadWrite': ['high', 'settings', 'Create, change and delete your mailbox settings.', 'Crear, cambiar y borrar la configuración de tu buzón.', []],
    'Calendars.Read': ['medium', 'calRead', 'Read the events in your calendars.', 'Leer los eventos de tus calendarios.', ['Calendars.ReadBasic']],
    'Calendars.ReadWrite': ['medium', 'calRead calWrite', 'Create, read, change and delete events in your calendars.', 'Crear, leer, cambiar y borrar eventos de tus calendarios.', ['Calendars.Read']],
    'Calendars.ReadBasic': ['low', 'calRead', 'Read your events without their body or attachments.', 'Leer tus eventos sin su descripción ni adjuntos.', []],
    'Contacts.Read': ['medium', 'contactsRead', 'Read your contacts.', 'Leer tus contactos.', []],
    'Contacts.ReadWrite': ['medium', 'contactsRead contactsWrite', 'Create, read, change and delete your contacts.', 'Crear, leer, cambiar y borrar tus contactos.', ['Contacts.Read']],
    'Files.Read': ['medium', 'filesRead', 'Read your own OneDrive files.', 'Leer tus propios archivos de OneDrive.', []],
    'Files.Read.All': ['medium', 'filesRead', 'Read every file you can open, including files others share with you and SharePoint.', 'Leer todos los archivos que puedes abrir, también los que otros comparten contigo y SharePoint.', ['Files.Read', 'Files.SelectedOperations.Selected']],
    'Files.ReadWrite': ['high', 'filesRead filesWrite', 'Read, create, change and delete your own files.', 'Leer, crear, cambiar y borrar tus propios archivos.', ['Files.ReadWrite.AppFolder']],
    'Files.ReadWrite.All': ['high', 'filesRead filesWrite', 'Read, create, change and delete every file you can open.', 'Leer, crear, cambiar y borrar todos los archivos que puedes abrir.', ['Files.ReadWrite', 'Files.SelectedOperations.Selected']],
    'Files.ReadWrite.AppFolder': ['low', '', 'Only the app\'s own folder.', 'Solo la carpeta de la propia aplicación.', []],
    'Files.SelectedOperations.Selected': ['low', '', 'Only the files someone gave this app access to in SharePoint.', 'Solo los archivos a los que alguien le dio acceso en SharePoint.', []],
    'Sites.Read.All': ['medium', 'filesRead', 'Read documents and lists in every SharePoint site.', 'Leer documentos y listas de todos los sitios de SharePoint.', ['Sites.Selected']],
    'Sites.ReadWrite.All': ['high', 'filesRead filesWrite', 'Edit or delete documents and lists in every SharePoint site.', 'Editar o borrar documentos y listas de todos los sitios de SharePoint.', ['Sites.Selected']],
    'Sites.Selected': ['low', '', 'Only the SharePoint sites an administrator picked for this app.', 'Solo los sitios de SharePoint que un administrador eligió para esta aplicación.', []],
    'Sites.FullControl.All': ['high', 'filesRead filesWrite share admin', 'Full control of every SharePoint site, including its permissions.', 'Control total de todos los sitios de SharePoint, incluidos sus permisos.', ['Sites.Selected'], true],
    'Sites.Manage.All': ['high', 'filesWrite', 'Create or delete document libraries and lists in every SharePoint site.', 'Crear o borrar bibliotecas de documentos y listas en todos los sitios de SharePoint.', ['Sites.Selected']],
    'User.Read': ['low', '', 'Sign you in and read your profile.', 'Iniciar tu sesión y leer tu perfil.', []],
    'User.ReadBasic.All': ['low', 'directory', 'Read the name, email and photo of the people in your company.', 'Leer el nombre, el correo y la foto de las personas de tu empresa.', []],
    'User.Read.All': ['medium', 'directory', 'Read the full profiles of the people in your company.', 'Leer los perfiles completos de las personas de tu empresa.', ['User.ReadBasic.All']],
    'User.ReadWrite.All': ['high', 'directory admin', 'Read and change the full profiles of the people in your company.', 'Leer y cambiar los perfiles completos de las personas de tu empresa.', ['User.ReadBasic.All'], true],
    'Directory.Read.All': ['medium', 'directory', 'Read your company directory: users, groups and apps.', 'Leer el directorio de tu empresa: usuarios, grupos y aplicaciones.', ['User.ReadBasic.All']],
    'Directory.ReadWrite.All': ['high', 'directory admin', 'Read and change your company directory, such as users and groups.', 'Leer y cambiar el directorio de tu empresa, como usuarios y grupos.', ['Directory.Read.All'], true],
    'Group.ReadWrite.All': ['high', 'directory admin', 'Create groups and read and change groups and their members.', 'Crear grupos y leer y cambiar grupos y sus miembros.', []],
    'Chat.Read': ['medium', 'msgRead', 'Read your Teams chats.', 'Leer tus chats de Teams.', []],
    'Chat.ReadWrite': ['high', 'msgRead msgSend', 'Read and write your Teams chats.', 'Leer y escribir en tus chats de Teams.', ['Chat.Read']],
    'ChannelMessage.Send': ['high', 'msgSend', 'Send messages to Teams channels as you.', 'Enviar mensajes a canales de Teams en tu nombre.', []],
    'ChatMessage.Send': ['high', 'msgSend', 'Send Teams chat messages as you.', 'Enviar mensajes de chat de Teams en tu nombre.', []],
    'Tasks.ReadWrite': ['medium', 'tasks', 'Create, read, change and delete your tasks, including shared lists.', 'Crear, leer, cambiar y borrar tus tareas, también las listas compartidas.', []],
    'Notes.ReadWrite.All': ['medium', 'notes share', 'Read, share and change every OneNote notebook you can open.', 'Leer, compartir y cambiar todos los cuadernos de OneNote que puedes abrir.', []],
    'People.Read': ['low', '', 'Read the list of people you work with most.', 'Leer la lista de personas con las que más trabajas.', []],
    'offline_access': ['low', '', 'Keep its access while you are not using the app. It adds no new permission.', 'Mantener su acceso mientras no usas la aplicación. No agrega permisos nuevos.', []],
    'openid': ['low', '', 'Sign you in.', 'Iniciar tu sesión.', []],
    'profile': ['low', '', 'See your basic profile (name, picture, user name, email).', 'Ver tu perfil básico (nombre, foto, usuario, correo).', []],
    'email': ['low', '', 'See your email address.', 'Ver tu dirección de correo.', []],
    'Application.ReadWrite.All': ['high', 'admin', 'Create, change and delete the apps registered in your company, and manage their permissions.', 'Crear, cambiar y borrar las aplicaciones registradas en tu empresa y administrar sus permisos.', [], true],
    'AppRoleAssignment.ReadWrite.All': ['high', 'admin', 'Grant itself or any app new permissions to any API, including Microsoft Graph.', 'Darse a sí misma o a cualquier aplicación permisos nuevos en cualquier API, incluido Microsoft Graph.', [], true],
    'RoleManagement.ReadWrite.Directory': ['high', 'admin', 'Change who has which admin role in your company.', 'Cambiar quién tiene cada rol de administrador en tu empresa.', [], true]
  };
  var MS = {}, MS_LOWER = {}, MS_BY_DESC = [];
  Object.keys(MROWS).forEach(function (name) {
    var r = MROWS[name], g = GRAPH[name] || {};
    MS[name] = { provider: 'microsoft', key: name, short: name, service: msService(name), doc: /^(openid|profile|email|offline_access)$/.test(name) ? DOC.oidc : DOC.graph, power: r[0], tags: r[1].split(' ').filter(Boolean), en: r[2], es: r[3], alt: r[4], fix: !!r[5], official: g.del || '', officialApp: g.app || null, delAdmin: !!g.delAdmin, appAdmin: !!g.appAdmin };
    MS_LOWER[name.toLowerCase()] = name;
    if (g.del && g.del.length >= 14) MS_BY_DESC.push([norm(g.del), name]);
  });
  function msService(n) {
    if (/^Mail/.test(n)) return 'Outlook mail'; if (/^Calendars/.test(n)) return 'Outlook calendar'; if (/^Contacts|^People/.test(n)) return 'Contacts';
    if (/^Files/.test(n)) return 'OneDrive / SharePoint files'; if (/^Sites/.test(n)) return 'SharePoint'; if (/^Chat|^Channel/.test(n)) return 'Teams';
    if (/^Tasks/.test(n)) return 'To Do'; if (/^Notes/.test(n)) return 'OneNote'; if (/^(openid|profile|email|offline_access|User\.Read)$/.test(n)) return 'Sign-in';
    return 'Microsoft Entra (company directory)';
  }

  function norm(s) { return String(s).toLowerCase().replace(/[’']/g, "'").replace(/[^a-z0-9' ]+/g, ' ').replace(/\s+/g, ' ').trim(); }

  // ---------- extraction ----------
  function safeDecode(s) { try { return decodeURIComponent(s.replace(/\+/g, ' ')); } catch (e) { return s.replace(/\+/g, ' '); } }

  function extract(text) {
    var raw = String(text == null ? '' : text).replace(/^﻿/, '');
    var ctx = { google: false, microsoft: false, offline: false, consentUrls: 0, defaultScope: [], fromText: 0 };
    var chunks = [raw], idTokens = [];
    var urlRe = /https?:\/\/[^\s"'<>`]+/g, m;
    while ((m = urlRe.exec(raw))) {
      var u = m[0], host = (u.match(/^https?:\/\/([^/?#:]+)/) || [])[1] || '';
      host = host.toLowerCase();
      if (/(^|\.)accounts\.google\.com$/.test(host)) ctx.google = true;
      if (/^login\.(microsoftonline|live|microsoft)\.com$/.test(host)) ctx.microsoft = true;
      var q = u.split('?')[1] || '';
      q.split(/[&#]/).forEach(function (kv) {
        var i = kv.indexOf('='); if (i < 0) return;
        var k = kv.slice(0, i).toLowerCase(), v = safeDecode(kv.slice(i + 1));
        if (k === 'scope') { ctx.consentUrls++; chunks.push(v); v.split(/\s+/).forEach(function (t) { if (/^(openid|email|profile|offline_access)$/i.test(t)) idTokens.push(t.toLowerCase()); }); }
        if (k === 'access_type' && v.toLowerCase() === 'offline') ctx.offline = true;
      });
    }
    var found = {}, order = [], unknown = [];
    function add(e, how) { if (!found[e.provider + '|' + e.key]) { found[e.provider + '|' + e.key] = { entry: e, how: how }; order.push(e.provider + '|' + e.key); } }
    var looseId = [];
    chunks.forEach(function (c, ci) {
      c.split(/[\s,;"'\[\]{}()<>|`]+/).forEach(function (tok) {
        var t = tok.replace(/[.:]+$/, '').replace(/^[.:]+/, '');
        if (!t) return;
        if (/^https?:\/\/mail\.google\.com\/?$/i.test(t)) { add(GOOGLE['https://mail.google.com/'], 'scope'); return; }
        var ga = t.match(/^https?:\/\/www\.googleapis\.com\/auth\/([A-Za-z0-9._-]+)$/);
        if (ga) { var k = GA + ga[1].toLowerCase(); if (GOOGLE[k]) add(GOOGLE[k], 'scope'); else if (unknown.indexOf(k) < 0) unknown.push(k); ctx.google = true; return; }
        var gm = t.match(/^https?:\/\/graph\.microsoft\.com\/(.+)$/i);
        if (gm) { ctx.microsoft = true; if (/\.default$/i.test(gm[1]) || gm[1] === '.default') { if (ctx.defaultScope.indexOf(t) < 0) ctx.defaultScope.push(t); return; } var n = MS_LOWER[gm[1].toLowerCase()]; if (n) add(MS[n], 'scope'); else if (unknown.indexOf(t) < 0) unknown.push(t); return; }
        if (/\/\.default$/i.test(t)) { ctx.microsoft = true; if (ctx.defaultScope.indexOf(t) < 0) ctx.defaultScope.push(t); return; }
        if (/^(openid|email|profile|offline_access)$/i.test(t)) { looseId.push(t.toLowerCase()); return; }
        var ms = MS_LOWER[t.toLowerCase()];
        if (ms && /[A-Z.]/.test(t) && t.indexOf('.') > 0) { add(MS[ms], 'scope'); ctx.microsoft = true; return; }
        if (/^(gmail|drive|calendar|spreadsheets|documents|presentations)(\.[a-z.]+)?$/.test(t) && (t.indexOf(".") > 0 || ci > 0) && GOOGLE[GA + t]) { add(GOOGLE[GA + t], 'scope'); ctx.google = true; }
      });
    });
    // Consent-screen text: match the official descriptions (best effort).
    var nraw = ' ' + norm(raw) + ' ';
    GOOGLE_BY_DESC.forEach(function (d) { if (d[0].length >= 20 && nraw.indexOf(' ' + d[0] + ' ') >= 0) { if (!found['google|' + d[1]]) ctx.fromText++; add(GOOGLE[d[1]], 'text'); ctx.google = true; } });
    MS_BY_DESC.forEach(function (d) { if (nraw.indexOf(' ' + d[0] + ' ') >= 0) { if (!found['microsoft|' + d[1]]) ctx.fromText++; add(MS[d[1]], 'text'); ctx.microsoft = true; } });
    if (/maintain access to data you have given it access to/.test(nraw)) add(MS.offline_access, 'text');
    // openid / email / profile / offline_access: only counted inside a scope parameter or next to real scopes.
    var written = order.some(function (k) { return found[k].how === 'scope'; });
    var ids = idTokens.concat(written ? looseId : []);
    if (ids.indexOf('offline_access') >= 0) { add(MS.offline_access, 'scope'); ctx.microsoft = true; }
    ids.forEach(function (t) {
      if (t === 'offline_access') return;
      if (ctx.microsoft && !ctx.google) add(MS[t], 'scope'); else add(GOOGLE[t], 'scope');
    });
    return { items: order.map(function (k) { return found[k]; }), unknown: unknown, ctx: ctx };
  }

  // ---------- analysis ----------
  var T = {
    en: {
      vFix: 'Fix this first', vFixP: 'This app asks for more than an assistant needs, or for something that can hurt your whole account. Each FIX item says what it is and what to ask for instead.',
      vCheck: 'Worth checking', vCheckP: 'This app can read or change a lot. That can be fine for the job you want; check each CHECK item and keep only what you use.',
      vClean: 'Narrow access', vCleanP: 'These permissions are limited. Nothing here can read your whole mailbox or Drive.',
      vEmpty: 'No permissions found', vEmptyP: 'Paste the scopes (for example https://www.googleapis.com/auth/drive or Mail.Read), the consent link, or the text of the consent screen.',
      plain: 'In plain words, this app can', plainNone: 'In plain words: nothing beyond signing you in and seeing basic profile data.',
      reads: 'reads', sends: 'sends', glossT: 'What Google\'s labels mean',
      svc: {},
      official: 'Official description', cls: { 'non-sensitive': 'Google: non-sensitive', sensitive: 'Google: sensitive', restricted: 'Google: restricted', none: 'Google publishes no class on this page' },
      restrictedWhy: 'Google calls restricted scopes "wide access" to user data; apps need restricted-scope verification, and a security assessment if they store or send that data to servers.',
      highRisk: 'on Google\'s high-risk list (a Workspace admin can block it)',
      adminDel: 'Microsoft: needs an administrator\'s approval.', adminApp: 'As an application permission the same name means ', adminAppReq: 'needs an administrator', appNone: 'There is no application version.',
      alt: 'Ask for this instead, if it covers the job', power: { high: 'can change or send', medium: 'can read a lot', low: 'limited' },
      fromText: 'recognised from the consent screen text',
      unknownT: 'Not in Llavero\'s list', unknownD: 'Llavero does not know these scopes. Look each one up in the vendor\'s list before you accept: ',
      comboSendT: 'It can read your mail or files and also send as you',
      comboSendD: 'An instruction hidden in an email, a web page or a file that the assistant reads can tell it to send what it read to someone else (OWASP calls this indirect prompt injection). OWASP\'s advice: the least access that does the job, and a person approves risky actions. If the tool has an "ask before sending" option, turn it on; or give reading and sending to separate connections.',
      shareT: 'It can change who has access to your files or calendars',
      shareD: 'A file or a calendar shared with "anyone with the link", or with an outside address, is out of your control. If the job does not need sharing, ask for a narrower scope.',
      offlineT: 'It keeps working when you are not there',
      offlineG: 'The link asks for access_type=offline: Google returns a refresh token so the app can keep using these permissions "when the user is not present at the browser".',
      offlineM: 'offline_access lets the app keep "access to data you have given it access to" while you are not using it. Microsoft also says it is implied by any delegated permission.',
      offlineFix: 'That is normal for automations (n8n, Zapier, scheduled agents). It also means a stolen token works until you remove the access. Remove apps you stopped using.',
      defaultT: 'It asks for "everything the app registered" (.default)',
      defaultD: 'With .default, Microsoft shows the consent screen for all the permissions in the app\'s registration. The list you pasted does not show what those are: look at the consent screen itself or ask the developer.',
      twoT: 'Microsoft: the same name can mean your mailbox or every mailbox',
      twoD: 'A delegated permission acts as you and only reaches what you can reach. The application version of the same name works without a signed-in user and covers the whole company (for example "Read mail in all mailboxes"), and always needs an administrator. A list of names does not say which one; the consent screen and your admin\'s list do.',
      adminT: 'Microsoft 365: an administrator has to approve these',
      adminD: 'If you are that administrator, you would approve them for the company. Ask what each one is for before you click Accept.',
      removeT: 'How to take the access back',
      removeG: 'Google account: open the linked apps page, choose "Access to your Google Account", pick the app, Remove access.',
      removeGA: 'Google Workspace admin: Admin console > Security > Access and data control > API controls. You can mark an app as Trusted, Limited, Specific Google data or Blocked, block the high-risk Gmail and Drive scopes for untrusted apps, and decide when external AI agents must ask users before acting.',
      removeM: 'Microsoft 365 work account: My Apps > "..." next to the app > Manage your application > Revoke Permissions. What your administrator approved can only be removed by the administrator.',
      agentG: 'Agents that use Google\'s Workspace MCP servers need an OAuth client marked as agentic; Google says the mark "does not grant additional scopes". The scopes are still the whole story.',
      fixMail: 'Google says to request this scope only if the app must delete email permanently. An assistant almost never needs that.',
      scopes: 'permissions', google: 'Google', microsoft: 'Microsoft', none: 'none', line: 'line', source: 'source', rating: 'Llavero\'s rating',
      header: 'Llavero', scopesFound: 'permissions found'
    },
    es: {
      vFix: 'Corrige esto primero', vFixP: 'Esta aplicación pide más de lo que necesita un asistente, o algo que puede dañar tu cuenta entera. Cada punto CORREGIR dice qué es y qué pedir en su lugar.',
      vCheck: 'Conviene revisar', vCheckP: 'Esta aplicación puede leer o cambiar mucho. Puede estar bien para lo que quieres hacer; revisa cada punto REVISAR y deja solo lo que usas.',
      vClean: 'Acceso acotado', vCleanP: 'Estos permisos son limitados. Nada aquí puede leer tu buzón entero ni tu Drive.',
      vEmpty: 'No encontré permisos', vEmptyP: 'Pega los permisos (por ejemplo https://www.googleapis.com/auth/drive o Mail.Read), el enlace de autorización o el texto de la pantalla de permisos.',
      plain: 'Dicho simple, esta aplicación puede', plainNone: 'Dicho simple: nada más que iniciar tu sesión y ver datos básicos del perfil.',
      reads: 'lee', sends: 'envía', glossT: 'Qué significan las categorías de Google',
      svc: { 'Sign-in': 'Inicio de sesión', 'Outlook mail': 'Correo de Outlook', 'Outlook calendar': 'Calendario de Outlook', 'Contacts': 'Contactos', 'OneDrive / SharePoint files': 'Archivos de OneDrive / SharePoint', 'Microsoft Entra (company directory)': 'Microsoft Entra (directorio de la empresa)', 'To Do': 'To Do' },
      official: 'Descripción oficial', cls: { 'non-sensitive': 'Google: no sensible', sensitive: 'Google: sensible', restricted: 'Google: restringido', none: 'Google no publica una clase en esta página' },
      restrictedWhy: 'Google llama a los permisos restringidos «acceso amplio» a los datos del usuario; las aplicaciones necesitan una verificación especial y, si guardan o envían esos datos a servidores, una evaluación de seguridad.',
      highRisk: 'en la lista de alto riesgo de Google (un administrador de Workspace puede bloquearlo)',
      adminDel: 'Microsoft: necesita la aprobación de un administrador.', adminApp: 'Como permiso de aplicación, el mismo nombre significa ', adminAppReq: 'necesita un administrador', appNone: 'No tiene versión de aplicación.',
      alt: 'Pide este en su lugar, si alcanza para lo que necesitas', power: { high: 'puede cambiar o enviar', medium: 'puede leer mucho', low: 'limitado' },
      fromText: 'reconocido por el texto de la pantalla de permisos',
      unknownT: 'No están en la lista de Llavero', unknownD: 'Llavero no conoce estos permisos. Búscalos uno por uno en la lista del proveedor antes de aceptar: ',
      comboSendT: 'Puede leer tu correo o tus archivos y además enviar en tu nombre',
      comboSendD: 'Una instrucción escondida en un correo, una página o un archivo que el asistente lee puede ordenarle enviar lo que leyó a otra persona (OWASP lo llama inyección indirecta de instrucciones). El consejo de OWASP: el mínimo acceso que sirva y que una persona apruebe las acciones riesgosas. Si la herramienta tiene la opción «preguntar antes de enviar», actívala; o separa la lectura y el envío en conexiones distintas.',
      shareT: 'Puede cambiar quién tiene acceso a tus archivos o calendarios',
      shareD: 'Un archivo o un calendario compartido con «cualquier persona con el enlace», o con una dirección de afuera, queda fuera de tu control. Si el trabajo no necesita compartir, pide un permiso más acotado.',
      offlineT: 'Sigue funcionando cuando no estás',
      offlineG: 'El enlace pide access_type=offline: Google entrega un token de actualización para que la aplicación siga usando estos permisos «cuando el usuario no está en el navegador».',
      offlineM: 'offline_access permite que la aplicación mantenga el «acceso a los datos a los que le diste acceso» mientras no la usas. Microsoft dice además que viene incluido con cualquier permiso delegado.',
      offlineFix: 'Es normal en automatizaciones (n8n, Zapier, agentes programados). También significa que un token robado sirve hasta que quites el acceso. Quita las aplicaciones que dejaste de usar.',
      defaultT: 'Pide «todo lo que la aplicación registró» (.default)',
      defaultD: 'Con .default, Microsoft muestra la pantalla de permisos con todos los permisos del registro de la aplicación. La lista que pegaste no dice cuáles son: mira la pantalla de permisos o pregúntale al desarrollador.',
      twoT: 'Microsoft: el mismo nombre puede ser tu buzón o todos los buzones',
      twoD: 'Un permiso delegado actúa como tú y solo llega a lo que tú puedes ver. La versión de aplicación del mismo nombre funciona sin nadie conectado y cubre toda la empresa (por ejemplo «Read mail in all mailboxes»), y siempre necesita un administrador. Una lista de nombres no dice cuál es; la pantalla de permisos y la lista de tu administrador sí.',
      adminT: 'Microsoft 365: un administrador tiene que aprobar estos',
      adminD: 'Si ese administrador eres tú, los aprobarías para toda la empresa. Pregunta para qué es cada uno antes de hacer clic en Aceptar.',
      removeT: 'Cómo quitar el acceso',
      removeG: 'Cuenta de Google: abre la página de aplicaciones vinculadas, elige «Acceso a tu Cuenta de Google», selecciona la aplicación y Quitar acceso.',
      removeGA: 'Administrador de Google Workspace: Consola de administración > Seguridad > Acceso y control de datos > Controles de API. Puedes marcar una aplicación como de confianza, limitada, con datos específicos de Google o bloqueada, bloquear los permisos de alto riesgo de Gmail y Drive para las que no son de confianza y decidir cuándo los agentes de IA externos deben preguntar antes de actuar.',
      removeM: 'Cuenta de trabajo de Microsoft 365: Mis aplicaciones > «...» junto a la aplicación > Administrar la aplicación > Revocar permisos. Lo que aprobó tu administrador solo lo puede quitar el administrador.',
      agentG: 'Los agentes que usan los servidores MCP de Google Workspace necesitan un cliente OAuth marcado como de agente; Google dice que esa marca «no otorga permisos adicionales». Los permisos siguen siendo lo que importa.',
      fixMail: 'Google dice que este permiso solo se pida si la aplicación debe borrar correos de forma permanente. Un asistente casi nunca lo necesita.',
      scopes: 'permisos', google: 'Google', microsoft: 'Microsoft', none: 'ninguno', line: 'línea', source: 'fuente', rating: 'valoración de Llavero',
      header: 'Llavero', scopesFound: 'permisos encontrados'
    }
  };

  var RANK = { fix: 0, check: 1, info: 2, ok: 3 }, PRANK = { high: 0, medium: 1, low: 2 };
  function levelOf(e) { if (e.fix) return 'fix'; if (e.power === 'high' || e.power === 'medium') return 'check'; return 'ok'; }
  function altKey(e, a) { return e.provider === 'google' ? (/^https:/.test(a) ? a : GA + a) : a; }

  function analyze(text, opts) {
    opts = opts || {};
    var lang = opts.lang === 'es' ? 'es' : 'en', t = T[lang], L = lang === 'es' ? 1 : 0;
    var x = extract(text), ctx = x.ctx;
    var scopes = x.items.map(function (it) {
      var e = it.entry, lv = levelOf(e);
      var notes = [];
      if (e.provider === 'google') {
        if (e.service !== 'Sign-in') notes.push(t.cls[e.cls || 'none'] + (e.highRisk ? ' · ' + t.highRisk : ''));
        if (e.key === 'https://mail.google.com/') notes.push(t.fixMail);
      } else {
        if (e.delAdmin) notes.push(t.adminDel);
        if (e.officialApp) notes.push(t.adminApp + '"' + e.officialApp + '"' + (e.appAdmin ? ' (' + t.adminAppReq + ')' : '') + '.');
      }
      var alts = e.alt.map(function (a) { var k = altKey(e, a), ae = e.provider === 'google' ? GOOGLE[k] : MS[k]; return ae ? { scope: e.provider === 'google' ? k : a, plain: lang === 'es' ? ae.es : ae.en } : null; }).filter(Boolean);
      return { provider: e.provider, scope: e.key, short: e.short, service: t.svc[e.service] || e.service, level: lv, power: e.power, powerText: t.power[e.power], plain: lang === 'es' ? e.es : e.en, official: e.official, cls: e.cls || null, highRisk: !!e.highRisk, delAdmin: !!e.delAdmin, appVersion: e.officialApp || null, notes: notes, alternatives: alts, doc: e.doc, how: it.how, tags: e.tags };
    }).sort(function (a, b) { return RANK[a.level] - RANK[b.level] || PRANK[a.power] - PRANK[b.power] || (a.provider < b.provider ? -1 : a.provider > b.provider ? 1 : 0); });

    var tags = {}; scopes.forEach(function (s) { s.tags.forEach(function (g) { tags[g] = true; }); });
    var findings = [];
    var reads = scopes.filter(function (s) { return s.tags.some(function (g) { return /^(mailRead|filesRead|msgRead)$/.test(g); }); });
    var sends = scopes.filter(function (s) { return s.tags.some(function (g) { return /^(mailSend|msgSend)$/.test(g); }); });
    if (reads.length && sends.length) findings.push({ id: 'read-and-send', level: 'check', title: t.comboSendT, detail: t.comboSendD, items: [t.reads + ': ' + reads.map(function (s) { return s.short; }).join(', '), t.sends + ': ' + sends.map(function (s) { return s.short; }).join(', ')], doc: DOC.owasp });
    var sharers = scopes.filter(function (s) { return s.tags.indexOf('share') >= 0; });
    if (sharers.length) findings.push({ id: 'can-share', level: 'check', title: t.shareT, detail: t.shareD, items: sharers.map(function (s) { return s.short; }) });
    var hasOfflineMs = scopes.some(function (s) { return s.provider === 'microsoft' && s.short === 'offline_access'; });
    var hasGoogle = scopes.some(function (s) { return s.provider === 'google'; });
    var hasMs = scopes.some(function (s) { return s.provider === 'microsoft'; });
    var bigOnes = scopes.some(function (s) { return s.level !== 'ok'; });
    if ((ctx.offline && hasGoogle) || hasOfflineMs) {
      var d = []; if (ctx.offline && hasGoogle) d.push(t.offlineG); if (hasOfflineMs) d.push(t.offlineM); d.push(t.offlineFix);
      findings.push({ id: 'offline', level: bigOnes ? 'check' : 'info', title: t.offlineT, detail: d.join(' '), items: [], doc: ctx.offline && hasGoogle ? DOC.goffline : DOC.oidc });
    }
    if (ctx.defaultScope.length) findings.push({ id: 'default-scope', level: 'check', title: t.defaultT, detail: t.defaultD, items: ctx.defaultScope.slice(), doc: DOC.oidc });
    var msWithApp = scopes.filter(function (s) { return s.provider === 'microsoft' && s.appVersion && s.level !== 'ok'; });
    if (msWithApp.length) findings.push({ id: 'delegated-or-app', level: 'info', title: t.twoT, detail: t.twoD, items: msWithApp.map(function (s) { return s.short + ' → "' + s.appVersion + '"'; }), doc: DOC.consent });
    var msAdmin = scopes.filter(function (s) { return s.provider === 'microsoft' && s.delAdmin; });
    if (msAdmin.length) findings.push({ id: 'admin-consent', level: 'info', title: t.adminT, detail: t.adminD, items: msAdmin.map(function (s) { return s.short; }), doc: DOC.graph });
    if (x.unknown.length) findings.push({ id: 'unknown', level: 'info', title: t.unknownT, detail: t.unknownD + (x.unknown.some(function (u) { return /graph\.microsoft/.test(u); }) ? DOC.graph : DOC.gid), items: x.unknown.slice() });
    findings.sort(function (a, b) { return RANK[a.level] - RANK[b.level]; });

    var plain = [];
    Object.keys(CAN).forEach(function (k) { if (tags[k]) plain.push(CAN[k][L]); });
    var worst = scopes.concat(findings).reduce(function (w, f) { return RANK[f.level] < RANK[w] ? f.level : w; }, 'ok');
    var verdict = !scopes.length && !x.unknown.length && !ctx.defaultScope.length ? 'empty' : worst === 'fix' ? 'fix' : worst === 'check' ? 'check' : 'clean';
    var remove = [];
    if (hasGoogle || ctx.google || x.unknown.some(function (u) { return /googleapis/.test(u); })) { remove.push({ text: t.removeG, link: DOC.glinked, help: DOC.glinkedHelp }); remove.push({ text: t.removeGA, link: DOC.gadmin }); }
    if (hasMs || ctx.microsoft) remove.push({ text: t.removeM, link: DOC.myapps });
    return {
      version: VERSION, lang: lang, verdict: verdict, scopes: scopes, findings: findings, plain: plain,
      counts: { google: scopes.filter(function (s) { return s.provider === 'google'; }).length, microsoft: scopes.filter(function (s) { return s.provider === 'microsoft'; }).length, unknown: x.unknown.length, fromText: ctx.fromText },
      context: { offline: ctx.offline, consentUrls: ctx.consentUrls, defaultScope: ctx.defaultScope }, remove: remove, agentNote: hasGoogle ? t.agentG : null,
      glossary: scopes.some(function (s) { return s.cls === 'restricted'; }) ? t.restrictedWhy : null
    };
  }
  function uniq(a) { return a.filter(function (v, i) { return a.indexOf(v) === i; }); }

  // ---------- text report ----------
  function report(res) {
    var t = T[res.lang], out = [], chip = res.lang === 'es' ? { fix: 'CORREGIR', check: 'REVISAR', info: 'INFO', ok: 'OK' } : { fix: 'FIX', check: 'CHECK', info: 'INFO', ok: 'OK' };
    var v = { fix: [t.vFix, t.vFixP], check: [t.vCheck, t.vCheckP], clean: [t.vClean, t.vCleanP], empty: [t.vEmpty, t.vEmptyP] }[res.verdict];
    out.push('Llavero ' + res.version);
    out.push('');
    out.push('>> ' + v[0].toUpperCase() + ' — ' + v[1]);
    if (res.verdict === 'empty') return out.join('\n') + '\n';
    out.push('');
    out.push(res.scopes.length + ' ' + t.scopesFound + ' (' + t.google + ' ' + res.counts.google + ' · ' + t.microsoft + ' ' + res.counts.microsoft + (res.counts.unknown ? ' · ? ' + res.counts.unknown : '') + ')');
    wrap(res.plain.length ? t.plain + ': ' + res.plain.join('; ') + '.' : t.plainNone, 80).forEach(function (l) { out.push(l); });
    out.push('');
    var W = res.lang === 'es' ? 11 : 8, IND = '           '.slice(0, W);
    function scopeLines(s) {
      out.push(pad(W, '[' + chip[s.level] + ']') + s.short + '  (' + s.service + ' · ' + t.rating + ': ' + s.powerText + ')');
      wrap(s.plain, 76).forEach(function (l) { out.push(IND + l); });
      if (s.official) out.push(IND + t.official + ': "' + s.official + '"' + (s.how === 'text' ? ' — ' + t.fromText : ''));
      s.notes.forEach(function (n) { wrap(n, 74).forEach(function (l, i) { out.push(IND + (i ? '  ' : '· ') + l); }); });
      s.alternatives.forEach(function (a) { wrap(t.alt + ': ' + a.scope.replace(GA, '') + ' — ' + a.plain, 74).forEach(function (l, i) { out.push(IND + (i ? '  ' : '→ ') + l); }); });
    }
    res.scopes.filter(function (s) { return s.level === 'fix'; }).forEach(scopeLines);
    res.findings.forEach(function (f) {
      out.push(pad(W, '[' + chip[f.level] + ']') + f.title);
      wrap(f.detail, 76).forEach(function (l) { out.push(IND + l); });
      f.items.forEach(function (i) { out.push(IND + '- ' + i); });
    });
    res.scopes.filter(function (s) { return s.level !== 'fix'; }).forEach(scopeLines);
    if (res.glossary) { out.push(''); out.push('== ' + t.glossT); wrap(res.glossary, 78).forEach(function (l) { out.push(l); }); }
    out.push('');
    out.push('== ' + t.removeT);
    res.remove.forEach(function (r) { wrap(r.text, 76).forEach(function (l, i) { out.push((i ? '  ' : '- ') + l); }); out.push('  ' + r.link); });
    if (res.agentNote) { out.push(''); wrap(res.agentNote, 78).forEach(function (l) { out.push(l); }); }
    return out.join('\n') + '\n';
  }
  function pad(w, s) { return (s + '            ').slice(0, w); }
  function wrap(s, w) { var words = String(s).split(' '), lines = [], cur = ''; words.forEach(function (x) { if ((cur + ' ' + x).trim().length > w && cur) { lines.push(cur); cur = x; } else cur = (cur + ' ' + x).trim(); }); if (cur) lines.push(cur); return lines; }

  var api = { VERSION: VERSION, analyze: analyze, extract: extract, report: report, T: T, DOC: DOC, GOOGLE: GOOGLE, MS: MS, _norm: norm };
  if (isNode) module.exports = api; else root.Llavero = api;

  // ---------- CLI ----------
  if (isNode && require.main === module) {
    var fs = require('fs'), path = require('path');
    var args = process.argv.slice(2), lang = 'en', json = false, demo = null, file = null;
    for (var i = 0; i < args.length; i++) {
      var a = args[i];
      if (a === '--es') lang = 'es'; else if (a === '--json') json = true;
      else if (a === '--demo') demo = args[++i] || 'chatgpt';
      else if (a === '-h' || a === '--help') { process.stdout.write('Usage: node llavero.js <file|-> [--es] [--json]\n       node llavero.js --demo chatgpt|n8n|outlook|tidy\nExit: 0 narrow, 1 worth checking, 2 fix this first, 3 no permissions found.\n'); process.exit(0); }
      else if (a === '-v' || a === '--version') { process.stdout.write(VERSION + '\n'); process.exit(0); }
      else file = a;
    }
    var input;
    try {
      if (demo) { var S = require('./samples.js'); if (!S[demo]) { process.stderr.write('Unknown demo: ' + demo + ' (chatgpt, n8n, outlook, tidy)\n'); process.exit(3); } input = S[demo]; }
      else if (!file || file === '-') input = fs.readFileSync(0, 'utf8');
      else input = fs.readFileSync(path.resolve(file), 'utf8');
    } catch (e) { process.stderr.write('Cannot read input: ' + e.message + '\n'); process.exit(3); }
    var res = analyze(input, { lang: lang });
    process.stdout.write(json ? JSON.stringify(res, null, 2) + '\n' : report(res));
    process.exit({ clean: 0, check: 1, fix: 2, empty: 3 }[res.verdict]);
  }
})(typeof window !== 'undefined' ? window : this);
