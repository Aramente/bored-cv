import os
import sqlite3
import json
from contextlib import contextmanager

DB_PATH = os.environ.get("DB_PATH", os.path.join(os.path.dirname(__file__), "..", "data", "boredcv.db"))

TURSO_DATABASE_URL = os.environ.get("TURSO_DATABASE_URL")
TURSO_AUTH_TOKEN = os.environ.get("TURSO_AUTH_TOKEN")

USE_TURSO = bool(TURSO_DATABASE_URL and TURSO_AUTH_TOKEN)


# ---------------------------------------------------------------------------
# Turso adapter classes
# ---------------------------------------------------------------------------

class TursoRow:
    """Wraps a libsql row to support both row["col"] and dict(row)."""

    def __init__(self, row, columns):
        self._data = {col: row[i] for i, col in enumerate(columns)}

    def __getitem__(self, key):
        return self._data[key]

    def keys(self):
        return self._data.keys()

    def __iter__(self):
        return iter(self._data.values())

    def __repr__(self):
        return f"TursoRow({self._data!r})"


class TursoResult:
    """Wraps a libsql result set to expose .fetchall(), .fetchone(), and .lastrowid."""

    def __init__(self, result, columns):
        self._columns = columns
        self._rows = [TursoRow(r, columns) for r in (result.rows or [])]
        # libsql-experimental exposes last_insert_rowid
        self.lastrowid = getattr(result, "last_insert_rowid", None)

    def fetchall(self):
        return self._rows

    def fetchone(self):
        return self._rows[0] if self._rows else None


class TursoConnection:
    """Wraps a libsql connection to match the sqlite3.Connection interface."""

    def __init__(self, conn):
        self._conn = conn

    def execute(self, sql, params=None):
        if params is None:
            params = []
        result = self._conn.execute(sql, list(params))
        columns = [col[0] if isinstance(col, (list, tuple)) else col for col in (result.columns or [])]
        return TursoResult(result, columns)

    def executescript(self, sql):
        statements = [s.strip() for s in sql.split(";") if s.strip()]
        last_result = None
        for stmt in statements:
            result = self._conn.execute(stmt)
            columns = [col[0] if isinstance(col, (list, tuple)) else col for col in (result.columns or [])]
            last_result = TursoResult(result, columns)
        return last_result

    def commit(self):
        self._conn.commit()

    def close(self):
        self._conn.close()


# ---------------------------------------------------------------------------
# DB path helper (SQLite only)
# ---------------------------------------------------------------------------

def get_db_path():
    # HF Spaces persistent storage
    if os.path.isdir("/data"):
        return "/data/boredcv.db"
    # Local dev
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    return DB_PATH


# ---------------------------------------------------------------------------
# Context manager
# ---------------------------------------------------------------------------

@contextmanager
def get_db():
    if USE_TURSO:
        import libsql_experimental as libsql
        raw = libsql.connect(
            "boredcv",
            sync_url=TURSO_DATABASE_URL,
            auth_token=TURSO_AUTH_TOKEN,
        )
        raw.sync()
        conn = TursoConnection(raw)
        try:
            yield conn
            conn.commit()
        finally:
            conn.close()
    else:
        conn = sqlite3.connect(get_db_path())
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA foreign_keys=ON")
        try:
            yield conn
            conn.commit()
        finally:
            conn.close()


# ---------------------------------------------------------------------------
# Schema init — same DDL as before
# ---------------------------------------------------------------------------

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
            CREATE INDEX IF NOT EXISTS idx_facts_knowledge ON facts(knowledge_id)
        """)


# Initialize on import
init_db()
