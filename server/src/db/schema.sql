-- ============================================================
-- CallBlast database schema
-- ============================================================

CREATE TABLE IF NOT EXISTS numbers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  number TEXT NOT NULL,
  group_name TEXT DEFAULT 'Genel',
  active INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS contact_groups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE NOT NULL,
  description TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS audio_files (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  original_name TEXT NOT NULL,
  filename TEXT NOT NULL,
  file_path TEXT NOT NULL,
  duration REAL DEFAULT 0,
  is_default INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS triggers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  number TEXT UNIQUE NOT NULL,
  audio_file_id INTEGER,
  prompt_audio_id INTEGER,
  group_name TEXT DEFAULT 'all',
  description TEXT,
  active INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (audio_file_id) REFERENCES audio_files(id),
  FOREIGN KEY (prompt_audio_id) REFERENCES audio_files(id)
);

CREATE TABLE IF NOT EXISTS blast_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  blast_id TEXT UNIQUE NOT NULL,
  trigger_type TEXT NOT NULL,
  trigger_source TEXT,
  audio_file_id INTEGER,
  audio_name TEXT,
  total_calls INTEGER DEFAULT 0,
  answered INTEGER DEFAULT 0,
  failed INTEGER DEFAULT 0,
  in_progress INTEGER DEFAULT 0,
  status TEXT DEFAULT 'started',
  started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  completed_at DATETIME,
  FOREIGN KEY (audio_file_id) REFERENCES audio_files(id)
);

CREATE TABLE IF NOT EXISTS call_details (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  blast_id TEXT NOT NULL,
  number TEXT NOT NULL,
  name TEXT,
  channel_id TEXT,
  status TEXT DEFAULT 'initiating',
  dial_time DATETIME,
  answer_time DATETIME,
  hangup_time DATETIME,
  duration REAL DEFAULT 0,
  hangup_cause TEXT,
  FOREIGN KEY (blast_id) REFERENCES blast_logs(blast_id)
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
