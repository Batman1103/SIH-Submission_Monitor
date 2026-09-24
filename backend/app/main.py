import os
import sqlite3
import threading
import time
from datetime import datetime, timezone
from typing import Optional

from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware

from .sih_scraper import fetch_problem_statements

DB_PATH = os.getenv(
    "SIH_DB_PATH",
    os.path.join(os.path.dirname(__file__), "..", "sih.db")
)
SYNC_MINUTES = int(os.getenv("SIH_SYNC_MINUTES", "5"))

app = FastAPI(title="SIH 2026 Submission Monitor", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

sync_state = {
    "status": "starting",
    "last_success": None,
    "last_error": None,
    "source": "https://www.sih.gov.in/sih2026PS",
}
sync_lock = threading.Lock()

def db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = db()
    conn.executescript("""
    CREATE TABLE IF NOT EXISTS problem_statements (
        ps_id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        organization TEXT,
        department TEXT,
        category TEXT NOT NULL,
        theme TEXT,
        submitted INTEGER NOT NULL DEFAULT 0,
        capacity INTEGER NOT NULL DEFAULT 500,
        deadline TEXT,
        description TEXT,
        updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS submission_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ps_id TEXT NOT NULL,
        submitted INTEGER NOT NULL,
        capacity INTEGER NOT NULL,
        captured_at TEXT NOT NULL
    );
    """)
    conn.commit()
    conn.close()

def sync_now():
    if not sync_lock.acquire(blocking=False):
        return {"status": "busy"}
    try:
        sync_state["status"] = "syncing"
        records = fetch_problem_statements()
        if not records:
            raise RuntimeError("No problem statements were parsed from the official SIH page.")

        now = datetime.now(timezone.utc).isoformat()
        conn = db()

        for r in records:
            conn.execute("""
                INSERT INTO problem_statements
                (ps_id,title,organization,department,category,theme,submitted,capacity,deadline,description,updated_at)
                VALUES (?,?,?,?,?,?,?,?,?,?,?)
                ON CONFLICT(ps_id) DO UPDATE SET
                  title=excluded.title,
                  organization=excluded.organization,
                  department=excluded.department,
                  category=excluded.category,
                  theme=excluded.theme,
                  submitted=excluded.submitted,
                  capacity=excluded.capacity,
                  deadline=excluded.deadline,
                  description=excluded.description,
                  updated_at=excluded.updated_at
            """, (
                r["ps_id"], r["title"], r["organization"], r["department"],
                r["category"], r["theme"], r["submitted"], r["capacity"],
                r["deadline"], r["description"], now
            ))
            conn.execute(
                "INSERT INTO submission_history(ps_id,submitted,capacity,captured_at) VALUES (?,?,?,?)",
                (r["ps_id"], r["submitted"], r["capacity"], now)
            )

        conn.commit()
        conn.close()
        sync_state["status"] = "live"
        sync_state["last_success"] = now
        sync_state["last_error"] = None
        return {"status": "ok", "count": len(records), "last_success": now}
    except Exception as exc:
        sync_state["status"] = "stale"
        sync_state["last_error"] = str(exc)
        return {"status": "error", "error": str(exc)}
    finally:
        sync_lock.release()

def sync_loop():
    while True:
        try:
            sync_now()
        except Exception:
            pass
        time.sleep(max(60, SYNC_MINUTES * 60))

@app.on_event("startup")
def startup():
    init_db()
    threading.Thread(target=sync_loop, daemon=True).start()

@app.get("/api/system/status")
def system_status():
    conn = db()
    count = conn.execute("SELECT COUNT(*) FROM problem_statements").fetchone()[0]
    conn.close()
    return {**sync_state, "records": count, "sync_minutes": SYNC_MINUTES}

@app.post("/api/sync")
def manual_sync():
    return sync_now()

@app.get("/api/problem-statements")
def problem_statements(
    category: Optional[str] = None,
    search: Optional[str] = None,
    theme: Optional[str] = None,
    limit: int = Query(100, ge=1, le=1000),
    offset: int = Query(0, ge=0),
):
    conn = db()
    clauses, params = [], []

    if category and category.lower() in ("software", "hardware"):
        clauses.append("LOWER(category)=?")
        params.append(category.lower())
    if search:
        clauses.append(
            "(LOWER(ps_id) LIKE ? OR LOWER(title) LIKE ? OR LOWER(organization) LIKE ?)"
        )
        q = f"%{search.lower()}%"
        params.extend([q, q, q])
    if theme:
        clauses.append("theme=?")
        params.append(theme)

    where = (" WHERE " + " AND ".join(clauses)) if clauses else ""
    total = conn.execute(
        f"SELECT COUNT(*) FROM problem_statements{where}", params
    ).fetchone()[0]

    rows = conn.execute(
        f"SELECT * FROM problem_statements{where} "
        "ORDER BY submitted ASC, ps_id ASC LIMIT ? OFFSET ?",
        params + [limit, offset]
    ).fetchall()
    conn.close()
    return {"total": total, "items": [dict(r) for r in rows]}

@app.get("/api/rankings/{category}/{direction}")
def rankings(category: str, direction: str, limit: int = Query(10, ge=1, le=100)):
    category = category.capitalize()
    if category not in ("Software", "Hardware"):
        return {"items": []}
    order = "ASC" if direction == "least" else "DESC"
    conn = db()
    rows = conn.execute(
        f"SELECT * FROM problem_statements "
        f"WHERE category=? ORDER BY submitted {order}, ps_id ASC LIMIT ?",
        (category, limit)
    ).fetchall()
    conn.close()
    return {"items": [dict(r) for r in rows]}

@app.get("/api/analytics/overview")
def overview():
    conn = db()
    total = conn.execute(
        "SELECT COUNT(*) FROM problem_statements"
    ).fetchone()[0]
    total_submissions = conn.execute(
        "SELECT COALESCE(SUM(submitted),0) FROM problem_statements"
    ).fetchone()[0]
    result = {"total": total, "total_submissions": total_submissions}

    for cat in ("Software", "Hardware"):
        row = conn.execute(
            "SELECT COUNT(*) AS count, COALESCE(SUM(submitted),0) AS submissions, "
            "COALESCE(AVG(submitted),0) AS average, COALESCE(MIN(submitted),0) AS minimum, "
            "COALESCE(MAX(submitted),0) AS maximum "
            "FROM problem_statements WHERE category=?",
            (cat,)
        ).fetchone()
        result[cat.lower()] = dict(row)
    conn.close()
    return result

@app.get("/api/problem-statements/{ps_id}")
def problem_statement(ps_id: str):
    conn = db()
    row = conn.execute(
        "SELECT * FROM problem_statements WHERE ps_id=?", (ps_id,)
    ).fetchone()
    history = conn.execute(
        "SELECT submitted, capacity, captured_at FROM submission_history "
        "WHERE ps_id=? ORDER BY captured_at ASC", (ps_id,)
    ).fetchall()
    conn.close()
    if not row:
        return {"error": "Problem Statement not found"}
    return {"item": dict(row), "history": [dict(r) for r in history]}
