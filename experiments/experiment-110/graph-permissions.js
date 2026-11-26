'use strict';
// Copied from the Microsoft Graph permissions reference
// (https://learn.microsoft.com/en-us/graph/permissions-reference), read on 2026-11-26.
// del/app = display text for delegated / application permission; *Admin = AdminConsentRequired.
(function (root) {
  var GRAPH = {
 "Mail.Read": {
  "del": "Read user mail",
  "app": "Read mail in all mailboxes",
  "delAdmin": false,
  "appAdmin": true,
  "delDesc": "Allows the app to read the signed-in user's mailbox."
 },
 "Mail.ReadBasic": {
  "del": "Read user basic mail",
  "app": "Read basic mail in all mailboxes",
  "delAdmin": false,
  "appAdmin": true,
  "delDesc": "Allows the app to read email in the signed-in user's mailbox except body, previewBody, attachments and any extended properties."
 },
 "Mail.ReadWrite": {
  "del": "Read and write access to user mail",
  "app": "Read and write mail in all mailboxes",
  "delAdmin": false,
  "appAdmin": true,
  "delDesc": "Allows the app to create, read, update, and delete email in user mailboxes. Does not include permission to send mail."
 },
 "Mail.Send": {
  "del": "Send mail as a user",
  "app": "Send mail as any user",
  "delAdmin": false,
  "appAdmin": true,
  "delDesc": "Allows the app to send mail as users in the organization."
 },
 "Mail.Read.Shared": {
  "del": "Read user and shared mail",
  "app": null,
  "delAdmin": false,
  "appAdmin": null,
  "delDesc": "Allows the app to read mail a user can access, including their own and shared mail."
 },
 "Mail.ReadWrite.Shared": {
  "del": "Read and write user and shared mail",
  "app": null,
  "delAdmin": false,
  "appAdmin": null,
  "delDesc": "Allows the app to create, read, update, and delete mail a user has permission to access, including their own and shared mail. Does not include permission to send mail."
 },
 "Mail.Send.Shared": {
  "del": "Send mail on behalf of others",
  "app": null,
  "delAdmin": false,
  "appAdmin": null,
  "delDesc": "Allows the app to send mail as the signed-in user, including sending on-behalf of others."
 },
 "MailboxSettings.ReadWrite": {
  "del": "Read and write user mailbox settings",
  "app": "Read and write all user mailbox settings",
  "delAdmin": false,
  "appAdmin": true,
  "delDesc": "Allows the app to create, read, update, and delete user's mailbox settings. Does not include permission to send mail."
 },
 "Calendars.Read": {
  "del": "Read user calendars",
  "app": "Read calendars in all mailboxes",
  "delAdmin": false,
  "appAdmin": true,
  "delDesc": "Allows the app to read events in user calendars."
 },
 "Calendars.ReadWrite": {
  "del": "Have full access to user calendars",
  "app": "Read and write calendars in all mailboxes",
  "delAdmin": false,
  "appAdmin": true,
  "delDesc": "Allows the app to create, read, update, and delete events in user calendars."
 },
 "Calendars.ReadBasic": {
  "del": "Read basic details of user calendars",
  "app": null,
  "delAdmin": false,
  "appAdmin": null,
  "delDesc": "Allows the app to read events in user calendars, except for properties such as body, attachments, and extensions."
 },
 "Contacts.Read": {
  "del": "Read user contacts",
  "app": "Read contacts in all mailboxes",
  "delAdmin": false,
  "appAdmin": true,
  "delDesc": "Allows the app to read user contacts."
 },
 "Contacts.ReadWrite": {
  "del": "Have full access to user contacts",
  "app": "Read and write contacts in all mailboxes",
  "delAdmin": false,
  "appAdmin": true,
  "delDesc": "Allows the app to create, read, update, and delete user contacts."
 },
 "Files.Read": {
  "del": "Read user files",
  "app": null,
  "delAdmin": false,
  "appAdmin": null,
  "delDesc": "Allows the app to read the signed-in user's files."
 },
 "Files.Read.All": {
  "del": "Read all files that user can access",
  "app": "Read files in all site collections",
  "delAdmin": false,
  "appAdmin": true,
  "delDesc": "Allows the app to read all files the signed-in user can access."
 },
 "Files.ReadWrite": {
  "del": "Have full access to user files",
  "app": null,
  "delAdmin": false,
  "appAdmin": null,
  "delDesc": "Allows the app to read, create, update and delete the signed-in user's files."
 },
 "Files.ReadWrite.All": {
  "del": "Have full access to all files user can access",
  "app": "Read and write files in all site collections",
  "delAdmin": false,
  "appAdmin": true,
  "delDesc": "Allows the app to read, create, update and delete all files the signed-in user can access."
 },
 "Files.ReadWrite.AppFolder": {
  "del": "Have full access to the application's folder (preview)",
  "app": "Have full access to the application's folder without a signed in user.",
  "delAdmin": false,
  "appAdmin": true,
  "delDesc": "(Preview) Allows the app to read, create, update and delete files in the application's folder."
 },
 "Files.SelectedOperations.Selected": {
  "del": "Access selected Files, on behalf of the signed-in user",
  "app": "Access selected Files without a signed in user.",
  "delAdmin": true,
  "appAdmin": true,
  "delDesc": "Allow the application to access files explicitly permissioned to the application on behalf of the signed in user. The specific files and the permissions granted will be configured in SharePoint Online or OneDrive."
 },
 "Sites.Read.All": {
  "del": "Read items in all site collections",
  "app": "Read items in all site collections",
  "delAdmin": false,
  "appAdmin": true,
  "delDesc": "Allows the application to read documents and list items in all site collections on behalf of the signed-in user"
 },
 "Sites.ReadWrite.All": {
  "del": "Edit or delete items in all site collections",
  "app": "Read and write items in all site collections",
  "delAdmin": false,
  "appAdmin": true,
  "delDesc": "Allows the application to edit or delete documents and list items in all site collections on behalf of the signed-in user."
 },
 "Sites.Selected": {
  "del": "Access selected Sites, on behalf of the signed-in user",
  "app": "Access selected site collections",
  "delAdmin": false,
  "appAdmin": true,
  "delDesc": "Allow the application to access a subset of site collections on behalf of the signed-in user. The specific site collections and the permissions granted will be configured in SharePoint Online."
 },
 "Sites.FullControl.All": {
  "del": "Have full control of all site collections",
  "app": "Have full control of all site collections",
  "delAdmin": true,
  "appAdmin": true,
  "delDesc": "Allows the application to have full control of all site collections on behalf of the signed-in user."
 },
 "Sites.Manage.All": {
  "del": "Create, edit, and delete items and lists in all site collections",
  "app": "Create, edit, and delete items and lists in all site collections",
  "delAdmin": false,
  "appAdmin": true,
  "delDesc": "Allows the application to create or delete document libraries and lists in all site collections on behalf of the signed-in user."
 },
 "User.Read": {
  "del": "Sign in and read user profile",
  "app": null,
  "delAdmin": false,
  "appAdmin": null,
  "delDesc": "Allows users to sign-in to the app, and allows the app to read the profile of signed-in users. It also allows the app to read basic company information of signed-in users."
 },
 "User.ReadBasic.All": {
  "del": "Read all users' basic profiles",
  "app": "Read all users' basic profiles",
  "delAdmin": false,
  "appAdmin": true,
  "delDesc": "Allows the app to read a basic set of profile properties of other users in your organization on behalf of the signed-in user. This includes display name, first and last name, email address and photo."
 },
 "User.Read.All": {
  "del": "Read all users' full profiles",
  "app": "Read all users' full profiles",
  "delAdmin": true,
  "appAdmin": true,
  "delDesc": "Allows the app to read the full set of profile properties, reports, and managers of other users in your organization, on behalf of the signed-in user."
 },
 "User.ReadWrite.All": {
  "del": "Read and write all users' full profiles",
  "app": "Read and write all users' full profiles",
  "delAdmin": true,
  "appAdmin": true,
  "delDesc": "Allows the app to read and write the full set of profile properties, reports, and managers of other users in your organization, on behalf of the signed-in user."
 },
 "Directory.Read.All": {
  "del": "Read directory data",
  "app": "Read directory data",
  "delAdmin": true,
  "appAdmin": true,
  "delDesc": "Allows the app to read data in your organization's directory, such as users, groups and apps."
 },
 "Directory.ReadWrite.All": {
  "del": "Read and write directory data",
  "app": "Read and write directory data",
  "delAdmin": true,
  "appAdmin": true,
  "delDesc": "Allows the app to read and write data in your organization's directory, such as users, and groups. It does not allow the app to delete users or groups, or reset user passwords."
 },
 "Group.ReadWrite.All": {
  "del": "Read and write all groups",
  "app": "Read and write all groups",
  "delAdmin": true,
  "appAdmin": true,
  "delDesc": "Allows the app to create groups and read all group properties and memberships on behalf of the signed-in user. Additionally allows group owners to manage their groups and allows group members to update group content."
 },
 "Chat.Read": {
  "del": "Read user chat messages",
  "app": null,
  "delAdmin": false,
  "appAdmin": null,
  "delDesc": "Allows an app to read 1 on 1 or group chats threads, on behalf of the signed-in user."
 },
 "Chat.ReadWrite": {
  "del": "Read and write user chat messages",
  "app": null,
  "delAdmin": false,
  "appAdmin": null,
  "delDesc": "Allows an app to read and write 1 on 1 or group chats threads, on behalf of the signed-in user."
 },
 "ChannelMessage.Send": {
  "del": "Send channel messages",
  "app": null,
  "delAdmin": false,
  "appAdmin": null,
  "delDesc": "Allows an app to send channel messages in Microsoft Teams, on behalf of the signed-in user."
 },
 "ChatMessage.Send": {
  "del": "Send user chat messages",
  "app": null,
  "delAdmin": false,
  "appAdmin": null,
  "delDesc": "Allows an app to send one-to-one and group chat messages in Microsoft Teams, on behalf of the signed-in user."
 },
 "Tasks.ReadWrite": {
  "del": "Create, read, update, and delete user's tasks and task lists",
  "app": null,
  "delAdmin": false,
  "appAdmin": null,
  "delDesc": "Allows the app to create, read, update, and delete the signed-in user's tasks and task lists, including any shared with the user."
 },
 "Notes.ReadWrite.All": {
  "del": "Read and write all OneNote notebooks that user can access",
  "app": "Read and write all OneNote notebooks",
  "delAdmin": false,
  "appAdmin": true,
  "delDesc": "Allows the app to read, share, and modify OneNote notebooks that the signed-in user has access to in the organization."
 },
 "People.Read": {
  "del": "Read users' relevant people lists",
  "app": null,
  "delAdmin": false,
  "appAdmin": null,
  "delDesc": "Allows the app to read a ranked list of relevant people of the signed-in user. The list includes local contacts, contacts from social networking, your organization's directory, and people from recent communications (such as email and Skype)."
 },
 "offline_access": {
  "del": "Maintain access to data you have given it access to",
  "app": null,
  "delAdmin": false,
  "appAdmin": null,
  "delDesc": "Allows the app to see and update the data you gave it access to, even when users are not currently using the app. This does not give the app any additional permissions."
 },
 "openid": {
  "del": "Sign users in",
  "app": null,
  "delAdmin": false,
  "appAdmin": null,
  "delDesc": "Allows users to sign in to the app with their work or school accounts and allows the app to see basic user profile information."
 },
 "profile": {
  "del": "View users' basic profile",
  "app": null,
  "delAdmin": false,
  "appAdmin": null,
  "delDesc": "Allows the app to see your users' basic profile (e.g., name, picture, user name, email address)"
 },
 "email": {
  "del": "View users' email address",
  "app": null,
  "delAdmin": false,
  "appAdmin": null,
  "delDesc": "Allows the app to read your users' primary email address"
 },
 "Application.ReadWrite.All": {
  "del": "Read and write applications",
  "app": "Read and write all applications",
  "delAdmin": true,
  "appAdmin": true,
  "delDesc": "Allows the app to create, read, update and delete applications and service principals on behalf of the signed-in user. Allows management of app role assignments, except those exposed by Microsoft Graph. Does not allow management of delegated permission grants."
 },
 "AppRoleAssignment.ReadWrite.All": {
  "del": "Manage app permission grants and app role assignments",
  "app": "Manage app permission grants and app role assignments",
  "delAdmin": true,
  "appAdmin": true,
  "delDesc": "Allows the app to manage permission grants for application permissions to any API (including Microsoft Graph) and application assignments for any app, on behalf of the signed-in user."
 },
 "RoleManagement.ReadWrite.Directory": {
  "del": "Read and write directory RBAC settings",
  "app": "Read and write all directory RBAC settings",
  "delAdmin": true,
  "appAdmin": true,
  "delDesc": "Allows the app to read and manage the role-based access control (RBAC) settings for your company's directory, on behalf of the signed-in user. This includes instantiating directory roles and managing directory role membership, and reading directory role templates, directory roles and memberships."
 }
};
  if (typeof module === 'object' && module.exports) module.exports = GRAPH; else root.LLAVERO_GRAPH = GRAPH;
})(typeof window !== 'undefined' ? window : this);
