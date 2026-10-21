CREATE TABLE IF NOT EXISTS accounts (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  imap_host TEXT NOT NULL,
  imap_port INTEGER NOT NULL DEFAULT 993,
  smtp_host TEXT NOT NULL,
  smtp_port INTEGER NOT NULL DEFAULT 587,
  username TEXT NOT NULL,
  use_tls INTEGER NOT NULL DEFAULT 1,
  default_signature_id INTEGER,
  color TEXT NOT NULL DEFAULT '#3584e4',
  imap_security TEXT NOT NULL DEFAULT 'tls',
  smtp_security TEXT NOT NULL DEFAULT 'starttls'
);
CREATE TABLE IF NOT EXISTS signatures (
  id INTEGER PRIMARY KEY,
  account_id INTEGER,
  name TEXT NOT NULL,
  language TEXT,
  context TEXT,
  body TEXT NOT NULL,
  is_default INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY(account_id) REFERENCES accounts(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY,
  account_id INTEGER NOT NULL,
  folder TEXT NOT NULL,
  uid INTEGER NOT NULL,
  subject TEXT NOT NULL DEFAULT '',
  from_name TEXT NOT NULL DEFAULT '',
  from_email TEXT NOT NULL DEFAULT '',
  to_text TEXT NOT NULL DEFAULT '',
  cc_text TEXT NOT NULL DEFAULT '',
  date_ts INTEGER NOT NULL,
  snippet TEXT NOT NULL DEFAULT '',
  body_text TEXT NOT NULL DEFAULT '',
  unread INTEGER NOT NULL DEFAULT 1,
  starred INTEGER NOT NULL DEFAULT 0,
  spam INTEGER NOT NULL DEFAULT 0,
  message_id TEXT NOT NULL DEFAULT '',
  in_reply_to TEXT NOT NULL DEFAULT '',
  references_text TEXT NOT NULL DEFAULT '',
  has_attachments INTEGER NOT NULL DEFAULT 0,
  pinned INTEGER NOT NULL DEFAULT 0,
  priority INTEGER NOT NULL DEFAULT 0,
  UNIQUE(account_id,folder,uid),
  FOREIGN KEY(account_id) REFERENCES accounts(id) ON DELETE CASCADE
);
CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5(
  subject, from_name, from_email, to_text, cc_text, snippet, body_text,
  content='messages', content_rowid='id'
);
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS folder_roles (
  account_id INTEGER NOT NULL,
  role TEXT NOT NULL,
  folder TEXT NOT NULL,
  PRIMARY KEY(account_id, role),
  FOREIGN KEY(account_id) REFERENCES accounts(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS templates (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  subject TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS sync_state (
  account_id INTEGER NOT NULL,
  folder TEXT NOT NULL,
  last_uid INTEGER NOT NULL DEFAULT 0,
  uid_validity INTEGER,
  PRIMARY KEY(account_id, folder),
  FOREIGN KEY(account_id) REFERENCES accounts(id) ON DELETE CASCADE
);

-- 0.4.0 productivity + calendar foundation
CREATE TABLE IF NOT EXISTS contacts (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL UNIQUE,
  frequency INTEGER NOT NULL DEFAULT 1,
  last_seen_ts INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS identities (
  id INTEGER PRIMARY KEY,
  account_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  signature_id INTEGER,
  is_default INTEGER NOT NULL DEFAULT 0,
  UNIQUE(account_id,email),
  FOREIGN KEY(account_id) REFERENCES accounts(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS mail_rules (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  field TEXT NOT NULL DEFAULT 'from',
  pattern TEXT NOT NULL,
  action TEXT NOT NULL,
  action_value TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS saved_searches (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  query TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS snoozes (
  message_id INTEGER PRIMARY KEY,
  until_ts INTEGER NOT NULL,
  original_folder TEXT NOT NULL,
  FOREIGN KEY(message_id) REFERENCES messages(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS scheduled_messages (
  id INTEGER PRIMARY KEY,
  account_id INTEGER NOT NULL,
  send_at_ts INTEGER NOT NULL,
  from_name TEXT NOT NULL DEFAULT '',
  from_email TEXT NOT NULL DEFAULT '',
  to_text TEXT NOT NULL,
  cc_text TEXT NOT NULL DEFAULT '',
  bcc_text TEXT NOT NULL DEFAULT '',
  subject TEXT NOT NULL DEFAULT '',
  text_body TEXT NOT NULL DEFAULT '',
  html_body TEXT NOT NULL DEFAULT '',
  in_reply_to TEXT,
  references_text TEXT,
  attachments_json TEXT NOT NULL DEFAULT '[]',
  request_read_receipt INTEGER NOT NULL DEFAULT 0,
  state TEXT NOT NULL DEFAULT 'pending',
  created_ts INTEGER NOT NULL,
  FOREIGN KEY(account_id) REFERENCES accounts(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS calendars (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#3584e4',
  visible INTEGER NOT NULL DEFAULT 1,
  read_only INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS calendar_sources (
  id INTEGER PRIMARY KEY,
  calendar_id INTEGER NOT NULL,
  kind TEXT NOT NULL DEFAULT 'caldav',
  url TEXT NOT NULL DEFAULT '',
  username TEXT NOT NULL DEFAULT '',
  shared INTEGER NOT NULL DEFAULT 0,
  last_sync_ts INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY(calendar_id) REFERENCES calendars(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS calendar_events (
  id INTEGER PRIMARY KEY,
  calendar_id INTEGER NOT NULL,
  uid TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  location TEXT NOT NULL DEFAULT '',
  start_ts INTEGER NOT NULL,
  end_ts INTEGER NOT NULL,
  all_day INTEGER NOT NULL DEFAULT 0,
  attendees TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'CONFIRMED',
  rrule TEXT NOT NULL DEFAULT '',
  source_message_id INTEGER,
  video_url TEXT NOT NULL DEFAULT '',
  timezone TEXT NOT NULL DEFAULT '',
  UNIQUE(calendar_id,uid),
  FOREIGN KEY(calendar_id) REFERENCES calendars(id) ON DELETE CASCADE,
  FOREIGN KEY(source_message_id) REFERENCES messages(id) ON DELETE SET NULL
);
CREATE TABLE IF NOT EXISTS calendar_reminders (
  id INTEGER PRIMARY KEY,
  event_id INTEGER NOT NULL,
  minutes_before INTEGER NOT NULL DEFAULT 10,
  last_fired_ts INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY(event_id) REFERENCES calendar_events(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY,
  title TEXT NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  due_ts INTEGER,
  completed INTEGER NOT NULL DEFAULT 0,
  source_message_id INTEGER,
  FOREIGN KEY(source_message_id) REFERENCES messages(id) ON DELETE SET NULL
);
CREATE TABLE IF NOT EXISTS message_extras (
  message_id INTEGER PRIMARY KEY,
  body_html TEXT NOT NULL DEFAULT '',
  attachments_json TEXT NOT NULL DEFAULT '[]',
  calendar_ics TEXT NOT NULL DEFAULT '',
  FOREIGN KEY(message_id) REFERENCES messages(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS rule_action_queue (
  id INTEGER PRIMARY KEY,
  message_id INTEGER NOT NULL,
  action TEXT NOT NULL,
  action_value TEXT NOT NULL DEFAULT '',
  created_ts INTEGER NOT NULL,
  UNIQUE(message_id, action, action_value),
  FOREIGN KEY(message_id) REFERENCES messages(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS calendar_event_exceptions (
  event_id INTEGER NOT NULL,
  occurrence_ts INTEGER NOT NULL,
  cancelled INTEGER NOT NULL DEFAULT 0,
  override_start_ts INTEGER,
  override_end_ts INTEGER,
  override_title TEXT,
  PRIMARY KEY(event_id, occurrence_ts),
  FOREIGN KEY(event_id) REFERENCES calendar_events(id) ON DELETE CASCADE
);

-- 0.5.0 consistency, sync and UX hardening
CREATE TABLE IF NOT EXISTS calendar_tombstones (
  calendar_id INTEGER NOT NULL,
  uid TEXT NOT NULL,
  deleted_ts INTEGER NOT NULL,
  PRIMARY KEY(calendar_id, uid),
  FOREIGN KEY(calendar_id) REFERENCES calendars(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS calendar_remote_state (
  calendar_id INTEGER NOT NULL,
  uid TEXT NOT NULL,
  href TEXT NOT NULL DEFAULT '',
  etag TEXT NOT NULL DEFAULT '',
  sequence INTEGER NOT NULL DEFAULT 0,
  updated_ts INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY(calendar_id, uid),
  FOREIGN KEY(calendar_id) REFERENCES calendars(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS operation_log (
  id INTEGER PRIMARY KEY,
  area TEXT NOT NULL,
  action TEXT NOT NULL,
  state TEXT NOT NULL,
  detail TEXT NOT NULL DEFAULT '',
  created_ts INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_calendar_reminder_unique
  ON calendar_reminders(event_id, minutes_before);

-- 0.6.0 lightweight productivity/background additions
CREATE TABLE IF NOT EXISTS set_aside (
  message_id INTEGER PRIMARY KEY,
  created_ts INTEGER NOT NULL,
  FOREIGN KEY(message_id) REFERENCES messages(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS follow_ups (
  id INTEGER PRIMARY KEY,
  account_id INTEGER NOT NULL,
  recipient TEXT NOT NULL DEFAULT '',
  subject_key TEXT NOT NULL DEFAULT '',
  due_ts INTEGER NOT NULL,
  created_ts INTEGER NOT NULL,
  state TEXT NOT NULL DEFAULT 'pending',
  note TEXT NOT NULL DEFAULT '',
  FOREIGN KEY(account_id) REFERENCES accounts(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_follow_ups_due ON follow_ups(state,due_ts);
