CREATE TABLE IF NOT EXISTS links (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  url TEXT NOT NULL,
  title TEXT NOT NULL,
  image TEXT,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS link_tags (
  link_id INTEGER NOT NULL,
  tag TEXT NOT NULL,
  PRIMARY KEY (link_id, tag)
);
CREATE INDEX IF NOT EXISTS idx_tag ON link_tags (tag);
CREATE INDEX IF NOT EXISTS idx_created ON links (created_at DESC);

