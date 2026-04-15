import os
import sqlite3
import json
from contextlib import contextmanager

import httpx

DB_PATH = os.environ.get("DB_PATH", os.path.join(os.path.dirname(__file__), "..", "data", "boredcv.db"))

TURSO_URL = os.environ.get("TURSO_DATABASE_URL", "")
TURSO_TOKEN = os.environ.get("TURSO_AUTH_TOKEN", "")

USE_TURSO = bool(TURSO_URL and TURSO_TOKEN)


# ---------------------------------------------------------------------------
# Turso HTTP adapter — uses httpx (already a dependency), zero new packages
# ---------------------------------------------------------------------------

def _turso_http_url():
    """Convert libsql:// URL to https:// for the HTTP API."""
    url = TURSO_URL
    if url.startswith("libsql://"):
        url = "https://" + url[len("libsql://"):]
    return url.rstrip("/")


def _turso_execute(stmts: list[dict]) -> list[dict]:
    """Execute statements via Turso HTTP pipeline API."""
    url = f"{_turso_http_url()}/v3/pipeline"
    requests = []
    for s in stmts:
        req = {"type": "execute", "stmt": {"sql": s["sql"]}}
        if s.get("args"):
            req["stmt"]["args"] = [{"type": "text", "value": str(v)} if isinstance(v, str)
                                    else {"type": "integer", "value": str(v)} if isinstance(v, int)
                                    else {"type": "null"} if v is None
                                    else {"type": "text", "value": str(v)}
                                    for v in s["args"]]
        requests.append(req)
    requests.append({"type": "close"})

    resp = httpx.post(url, json={"requests": requests},
                      headers={"Authorization": f"Bearer {TURSO_TOKEN}"},
                      timeout=30.0)
    resp.raise_for_status()
    return resp.json().get("results", [])


class TursoRow:
    """Dict-like row — supports row["col"] and dict(row)."""

    def __init__(self, columns: list[str], values: list):
        self._data = {}
        for i, col in enumerate(columns):
            val = values[i]
            # Turso returns values as {"type": "text", "value": "..."} objects
            if isinstance(val, dict) and "value" in val:
                self._data[col] = val["value"]
            elif isinstance(val, dict) and val.get("type") == "null":
                self._data[col] = None
            else:
                self._data[col] = val

    def __getitem__(self, key):
        return self._data[key]

    def keys(self):
        return self._data.keys()

    def __iter__(self):
        return iter(self._data.values())


class TursoResult:
    """Wraps Turso HTTP response to match sqlite3.Cursor interface."""

    def __init__(self, result: dict):
        resp = result.get("response", {}).get("result", {})
        cols_raw = resp.get("cols", [])
        self._columns = [c.get("name", "") if isinstance(c, dict) else c for c in cols_raw]
        self._rows = [TursoRow(self._columns, r) for r in resp.get("rows", [])]
        self.lastrowid = resp.get("last_insert_rowid")

    def fetchall(self):
        return self._rows

    def fetchone(self):
        return self._rows[0] if self._rows else None


class TursoConnection:
    """Sync connection wrapping Turso HTTP API — matches sqlite3.Connection interface."""

    def execute(self, sql: str, params=None):
        args = list(params) if params else []
        results = _turso_execute([{"sql": sql, "args": args}])
        return TursoResult(results[0]) if results else TursoResult({})

    def executescript(self, sql: str):
        statements = [s.strip() for s in sql.split(";") if s.strip()]
        stmts = [{"sql": s} for s in statements]
        results = _turso_execute(stmts)
        return TursoResult(results[-1]) if results else TursoResult({})

    def commit(self):
        pass  # Turso auto-commits

    def close(self):
        pass  # HTTP — no persistent connection


# ---------------------------------------------------------------------------
# DB path helper (SQLite only)
# ---------------------------------------------------------------------------

def _get_local_db_path():
    if os.path.isdir("/data"):
        return "/data/boredcv.db"
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    return DB_PATH


# ---------------------------------------------------------------------------
# Context manager
# ---------------------------------------------------------------------------

@contextmanager
def get_db():
    if USE_TURSO:
        conn = TursoConnection()
        try:
            yield conn
        finally:
            conn.close()
    else:
        conn = sqlite3.connect(_get_local_db_path())
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA foreign_keys=ON")
        try:
            yield conn
            conn.commit()
        finally:
            conn.close()


# ---------------------------------------------------------------------------
# Schema init
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
