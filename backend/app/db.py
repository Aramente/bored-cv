import os
import sqlite3
import json
from contextlib import contextmanager

DB_PATH = os.environ.get("DB_PATH", os.path.join(os.path.dirname(__file__), "..", "data", "boredcv.db"))


def get_db_path():
    # HF Spaces persistent storage
    if os.path.isdir("/data"):
        return "/data/boredcv.db"
    # Local dev
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    return DB_PATH


@contextmanager
def get_db():
    conn = sqlite3.connect(get_db_path())
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def init_db():
    with get_db() as conn:
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS users (
                id TEXT PRIMARY KEY,
                email TEXT NOT NULL,
                provider TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS knowledge (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id TEXT NOT NULL REFERENCES users(id),
                company TEXT NOT NULL,
                company_context TEXT DEFAULT '',
                title TEXT NOT NULL,
                dates TEXT DEFAULT '',
                description TEXT DEFAULT '',
                facts TEXT DEFAULT '{}',
                best_bullets TEXT DEFAULT '[]',
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS projects (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id TEXT NOT NULL REFERENCES users(id),
                name TEXT NOT NULL,
                offer_title TEXT DEFAULT '',
                offer_url TEXT DEFAULT '',
                offer_data TEXT DEFAULT '{}',
                profile_data TEXT DEFAULT '{}',
                gap_analysis TEXT DEFAULT '{}',
                cv_data TEXT DEFAULT '{}',
                messages TEXT DEFAULT '[]',
                match_score INTEGER DEFAULT 0,
                template TEXT DEFAULT 'clean',
                tone TEXT DEFAULT 'startup',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS facts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id TEXT NOT NULL REFERENCES users(id),
                knowledge_id INTEGER REFERENCES knowledge(id),
                key TEXT NOT NULL,
                value TEXT NOT NULL,
                source_project_id INTEGER REFERENCES projects(id),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE INDEX IF NOT EXISTS idx_knowledge_user ON knowledge(user_id);
            CREATE INDEX IF NOT EXISTS idx_projects_user ON projects(user_id);
            CREATE INDEX IF NOT EXISTS idx_facts_user ON facts(user_id);
            CREATE INDEX IF NOT EXISTS idx_facts_knowledge ON facts(knowledge_id);
        """)


# Initialize on import
init_db()
