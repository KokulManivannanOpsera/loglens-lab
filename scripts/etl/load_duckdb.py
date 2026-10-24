#!/usr/bin/env python3
"""
BRING — Warehouse stand-in: load exported CSV into a DuckDB file.

Prereq:
  pip install duckdb
  npm run export:history --workspace=server

Usage:
  python3 scripts/etl/load_duckdb.py
  → server/data/exports/loglens.duckdb
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CSV = ROOT / "server" / "data" / "exports" / "diagnosis_runs.csv"
DB = ROOT / "server" / "data" / "exports" / "loglens.duckdb"


def main() -> int:
    try:
        import duckdb
    except ImportError:
        print("Install duckdb: pip install duckdb", file=sys.stderr)
        return 1

    if not CSV.is_file():
        print(f"Missing {CSV}\nRun: npm run export:history --workspace=server", file=sys.stderr)
        return 1

    DB.parent.mkdir(parents=True, exist_ok=True)
    if DB.exists():
        DB.unlink()

    con = duckdb.connect(str(DB))
    con.execute(
        f"""
        CREATE TABLE diagnosis_runs AS
        SELECT * FROM read_csv_auto('{CSV.as_posix()}', header=True)
        """
    )
    n = con.execute("SELECT COUNT(*) FROM diagnosis_runs").fetchone()[0]
    by_provider = con.execute(
        """
        SELECT provider, COUNT(*) AS n
        FROM diagnosis_runs
        GROUP BY provider
        ORDER BY n DESC
        """
    ).fetchall()
    con.close()

    print(f"Loaded {n} rows → {DB}")
    print("By provider:")
    for provider, count in by_provider:
        print(f"  {provider}: {count}")
    print("Example: duckdb server/data/exports/loglens.duckdb")
    print('  SELECT likely_cause, COUNT(*) FROM diagnosis_runs GROUP BY 1 LIMIT 5;')
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
