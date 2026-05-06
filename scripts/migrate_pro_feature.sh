#!/usr/bin/env bash
# migrate_pro_feature.sh — Agrega is_pro a questions y has_pro_access a users (idempotente)
set -euo pipefail

ssh haurbano@192.168.1.66 "docker exec preurbano-new-backend-1 python3 -c \"
import sqlite3
con = sqlite3.connect('/app/data/db.sqlite')
def add_col(table, col, ddl):
    cols = {r[1] for r in con.execute(f'PRAGMA table_info({table})')}
    if col not in cols:
        con.execute(f'ALTER TABLE {table} ADD COLUMN {ddl}')
        print(f'+ {table}.{col}')
    else:
        print(f'= {table}.{col} ya existe')
con.execute('BEGIN')
add_col('questions', 'is_pro', 'is_pro INTEGER NOT NULL DEFAULT 0')
add_col('users', 'has_pro_access', 'has_pro_access INTEGER NOT NULL DEFAULT 0')
con.commit()
print('Migración completada.')
\""
