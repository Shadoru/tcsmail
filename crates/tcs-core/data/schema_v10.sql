-- TCS Mail 0.8.0 additive schema. Existing v9 tables remain untouched.
CREATE TABLE IF NOT EXISTS mailbox_sync_v2 (
  account_id INTEGER NOT NULL,
  folder TEXT NOT NULL,
  uid_validity INTEGER,
  highest_seen_uid INTEGER NOT NULL DEFAULT 0,
  oldest_synced_uid INTEGER,
  backfill_complete INTEGER NOT NULL DEFAULT 0,
  highest_modseq INTEGER,
  last_reconcile_ts INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY(account_id,folder),
  FOREIGN KEY(account_id) REFERENCES accounts(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS pending_operations (
  op_id TEXT PRIMARY KEY,
  account_id INTEGER NOT NULL,
  message_id INTEGER,
  kind TEXT NOT NULL,
  payload_json TEXT NOT NULL DEFAULT '{}',
  state TEXT NOT NULL DEFAULT 'queued',
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_ts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT NOT NULL DEFAULT '',
  created_ts INTEGER NOT NULL,
  updated_ts INTEGER NOT NULL,
  FOREIGN KEY(account_id) REFERENCES accounts(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_pending_operations_state ON pending_operations(state,next_attempt_ts);
CREATE TABLE IF NOT EXISTS outbound_queue_v2 (
  id TEXT PRIMARY KEY,
  account_id INTEGER NOT NULL,
  message_id_header TEXT NOT NULL,
  draft_json TEXT NOT NULL,
  send_at_ts INTEGER NOT NULL,
  undo_until_ts INTEGER NOT NULL DEFAULT 0,
  state TEXT NOT NULL DEFAULT 'queued',
  sent_copy_folder TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT NOT NULL DEFAULT '',
  created_ts INTEGER NOT NULL,
  updated_ts INTEGER NOT NULL,
  FOREIGN KEY(account_id) REFERENCES accounts(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_outbound_due ON outbound_queue_v2(state,send_at_ts);
CREATE TABLE IF NOT EXISTS local_drafts_v2 (
  id TEXT PRIMARY KEY,
  account_id INTEGER NOT NULL,
  draft_json TEXT NOT NULL,
  dirty INTEGER NOT NULL DEFAULT 1,
  server_uid INTEGER,
  server_uidvalidity INTEGER,
  updated_ts INTEGER NOT NULL,
  FOREIGN KEY(account_id) REFERENCES accounts(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS attachment_handles (
  id TEXT PRIMARY KEY,
  draft_id TEXT NOT NULL,
  path TEXT NOT NULL,
  filename TEXT NOT NULL,
  mime_type TEXT NOT NULL DEFAULT 'application/octet-stream',
  size INTEGER NOT NULL DEFAULT 0,
  inline_cid TEXT NOT NULL DEFAULT '',
  created_ts INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_attachment_handles_draft ON attachment_handles(draft_id);
CREATE TABLE IF NOT EXISTS message_local_metadata (
  account_id INTEGER NOT NULL,
  message_id_header TEXT NOT NULL,
  pinned INTEGER NOT NULL DEFAULT 0,
  priority INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY(account_id,message_id_header),
  FOREIGN KEY(account_id) REFERENCES accounts(id) ON DELETE CASCADE
);
CREATE TRIGGER IF NOT EXISTS preserve_local_message_metadata_before_delete
BEFORE DELETE ON messages
WHEN OLD.message_id <> ''
BEGIN
  INSERT INTO message_local_metadata(account_id,message_id_header,pinned,priority)
  VALUES(OLD.account_id,OLD.message_id,OLD.pinned,OLD.priority)
  ON CONFLICT(account_id,message_id_header) DO UPDATE SET pinned=excluded.pinned,priority=excluded.priority;
END;
CREATE TRIGGER IF NOT EXISTS restore_local_message_metadata_after_insert
AFTER INSERT ON messages
WHEN NEW.message_id <> ''
BEGIN
  UPDATE messages SET
    pinned=COALESCE((SELECT pinned FROM message_local_metadata WHERE account_id=NEW.account_id AND message_id_header=NEW.message_id),NEW.pinned),
    priority=COALESCE((SELECT priority FROM message_local_metadata WHERE account_id=NEW.account_id AND message_id_header=NEW.message_id),NEW.priority)
  WHERE id=NEW.id;
END;
-- Added separately so existing v10 development databases can be upgraded idempotently.

CREATE TABLE IF NOT EXISTS attachment_cache_v2 (
  message_id INTEGER NOT NULL,
  attachment_index INTEGER NOT NULL,
  filename TEXT NOT NULL,
  mime_type TEXT NOT NULL DEFAULT 'application/octet-stream',
  content_id TEXT,
  size INTEGER NOT NULL DEFAULT 0,
  cache_path TEXT NOT NULL,
  last_access_ts INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY(message_id, attachment_index),
  FOREIGN KEY(message_id) REFERENCES messages(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_attachment_cache_access ON attachment_cache_v2(last_access_ts);

CREATE TABLE IF NOT EXISTS contact_sources_v2 (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL DEFAULT 'CardDAV',
  url TEXT NOT NULL,
  username TEXT NOT NULL DEFAULT '',
  enabled INTEGER NOT NULL DEFAULT 1,
  last_sync_ts INTEGER NOT NULL DEFAULT 0
);

-- Preserve local productivity state across IMAP UIDVALIDITY resets / MOVE UID changes.
CREATE TABLE IF NOT EXISTS snooze_metadata_v2 (
  account_id INTEGER NOT NULL,
  message_id_header TEXT NOT NULL,
  until_ts INTEGER NOT NULL,
  original_folder TEXT NOT NULL,
  PRIMARY KEY(account_id,message_id_header)
);
CREATE TABLE IF NOT EXISTS set_aside_metadata_v2 (
  account_id INTEGER NOT NULL,
  message_id_header TEXT NOT NULL,
  created_ts INTEGER NOT NULL,
  PRIMARY KEY(account_id,message_id_header)
);
CREATE TRIGGER IF NOT EXISTS preserve_productivity_before_message_delete
BEFORE DELETE ON messages
WHEN OLD.message_id <> ''
BEGIN
  INSERT INTO snooze_metadata_v2(account_id,message_id_header,until_ts,original_folder)
  SELECT OLD.account_id,OLD.message_id,s.until_ts,s.original_folder FROM snoozes s WHERE s.message_id=OLD.id
  ON CONFLICT(account_id,message_id_header) DO UPDATE SET until_ts=excluded.until_ts,original_folder=excluded.original_folder;
  INSERT INTO set_aside_metadata_v2(account_id,message_id_header,created_ts)
  SELECT OLD.account_id,OLD.message_id,s.created_ts FROM set_aside s WHERE s.message_id=OLD.id
  ON CONFLICT(account_id,message_id_header) DO UPDATE SET created_ts=excluded.created_ts;
END;
CREATE TRIGGER IF NOT EXISTS restore_productivity_after_message_insert
AFTER INSERT ON messages
WHEN NEW.message_id <> ''
BEGIN
  INSERT INTO snoozes(message_id,until_ts,original_folder)
  SELECT NEW.id,s.until_ts,s.original_folder FROM snooze_metadata_v2 s WHERE s.account_id=NEW.account_id AND s.message_id_header=NEW.message_id
  ON CONFLICT(message_id) DO UPDATE SET until_ts=excluded.until_ts,original_folder=excluded.original_folder;
  INSERT INTO set_aside(message_id,created_ts)
  SELECT NEW.id,s.created_ts FROM set_aside_metadata_v2 s WHERE s.account_id=NEW.account_id AND s.message_id_header=NEW.message_id
  ON CONFLICT(message_id) DO UPDATE SET created_ts=excluded.created_ts;
END;

CREATE TABLE IF NOT EXISTS contact_groups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE
);
CREATE TABLE IF NOT EXISTS contact_group_members (
  group_id INTEGER NOT NULL,
  contact_id INTEGER NOT NULL,
  PRIMARY KEY(group_id, contact_id),
  FOREIGN KEY(group_id) REFERENCES contact_groups(id) ON DELETE CASCADE,
  FOREIGN KEY(contact_id) REFERENCES contacts(id) ON DELETE CASCADE
);
