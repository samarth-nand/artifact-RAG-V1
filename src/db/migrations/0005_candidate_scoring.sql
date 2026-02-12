-- Migration: Candidate Assessment Invites, Sessions & Scoring
-- Tables live in Turso (SQLite)

-- Assessment invites: recruiter sends a unique link to each candidate
CREATE TABLE IF NOT EXISTS assessment_invites (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  assessment_id INTEGER NOT NULL,
  candidate_email TEXT NOT NULL,
  candidate_name TEXT,
  token TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending',  -- pending | opened | in_progress | completed | expired
  expires_at TEXT NOT NULL,
  opened_at TEXT,
  started_at TEXT,
  completed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_invites_token ON assessment_invites(token);
CREATE INDEX IF NOT EXISTS idx_invites_assessment ON assessment_invites(assessment_id);
CREATE INDEX IF NOT EXISTS idx_invites_email ON assessment_invites(candidate_email);

-- Candidate sessions: one per scenario per invite
CREATE TABLE IF NOT EXISTS candidate_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  invite_id INTEGER NOT NULL,
  assessment_id INTEGER NOT NULL,
  scenario_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',  -- pending | live | ended | grading | done | failed
  transcript TEXT,
  started_at TEXT,
  ended_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_csessions_invite ON candidate_sessions(invite_id);
CREATE INDEX IF NOT EXISTS idx_csessions_assessment ON candidate_sessions(assessment_id);

-- Candidate scores: grading results per session
CREATE TABLE IF NOT EXISTS candidate_scores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER NOT NULL,
  invite_id INTEGER NOT NULL,
  assessment_id INTEGER NOT NULL,
  scenario_id TEXT NOT NULL,
  overall_score INTEGER NOT NULL DEFAULT 0,
  dimension_scores TEXT,       -- JSON: { name: { score, weight, rationale, evidence } }
  key_signals_hit TEXT,        -- JSON string[]
  red_flags_found TEXT,        -- JSON string[]
  strengths TEXT,              -- JSON string[]
  improvements TEXT,           -- JSON string[]
  is_test_attempt INTEGER NOT NULL DEFAULT 0,
  model TEXT,
  prompt_tokens INTEGER,
  completion_tokens INTEGER,
  graded_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_cscores_invite ON candidate_scores(invite_id);
CREATE INDEX IF NOT EXISTS idx_cscores_assessment ON candidate_scores(assessment_id);
CREATE INDEX IF NOT EXISTS idx_cscores_session ON candidate_scores(session_id);
