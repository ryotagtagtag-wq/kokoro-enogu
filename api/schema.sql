-- ココロの絵の具 D1 スキーマ
CREATE TABLE IF NOT EXISTS cards (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
  colors TEXT NOT NULL,              -- JSON配列 ["#ff0000", ...]
  shape TEXT NOT NULL,               -- toge | fuwa | gunya
  svg TEXT NOT NULL                  -- 生成したSVG文字列
);
CREATE INDEX IF NOT EXISTS idx_cards_created_at ON cards(created_at);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
-- settings keys:
--   sos_enabled            '1' | '0'
--   ai_reflection_enabled  '1' | '0'
--   parent_passcode_hash   SHA-256 hex
--   child_nickname         表示名
