"""Export CollabEditor SQLite rows to JSON before switching to PostgreSQL."""
import base64
import json
import sqlite3
import sys
from pathlib import Path


if len(sys.argv) < 2:
    raise SystemExit(
        "Usage: python apps/backend/prisma/export-sqlite.py "
        "apps/backend/dev.db [collab-export.json]"
    )

database_path = Path(sys.argv[1])
output_path = Path(sys.argv[2]) if len(sys.argv) > 2 else Path("collab-export.json")
if not database_path.is_file():
    raise SystemExit(f"SQLite database not found: {database_path}")

tables = ("User", "Room", "RoomAccess", "RoomJoinRequest", "Friendship", "File")
connection = sqlite3.connect(f"file:{database_path.resolve().as_posix()}?mode=ro", uri=True)
connection.row_factory = sqlite3.Row

def encode_value(value):
    if isinstance(value, (bytes, bytearray, memoryview)):
        return {"__base64__": base64.b64encode(bytes(value)).decode("ascii")}
    return value

export = {}
for table in tables:
    export[table] = [
        {key: encode_value(value) for key, value in dict(row).items()}
        for row in connection.execute(f' SELECT * FROM "{table}"')
    ]

connection.close()
output_path.write_text(json.dumps(export, indent=2), encoding="utf-8")
print(f"Exported {sum(map(len, export.values()))} rows to {output_path}")
print("This export contains account email addresses and password hashes; keep it private.")
