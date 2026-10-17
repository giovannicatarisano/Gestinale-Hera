import os
import json
from pathlib import Path
from datetime import datetime
from dotenv import load_dotenv
import pymongo
import certifi

ROOT = Path(__file__).resolve().parent.parent
load_dotenv(ROOT / "backend" / ".env")

url = os.environ.get("MONGO_URL")
db_name = os.environ.get("DB_NAME", "hera_gestionale")

out_dir = ROOT / "backups" / "database" / db_name
out_dir.mkdir(parents=True, exist_ok=True)

print(f"Connecting to MongoDB Atlas -> DB: {db_name}...")
client = pymongo.MongoClient(url, tlsCAFile=certifi.where(), serverSelectionTimeoutMS=8000)
db = client[db_name]

cols = db.list_collection_names()
summary = {}

for col_name in cols:
    docs = list(db[col_name].find({}, {"_id": 0}))
    out_file = out_dir / f"{col_name}.json"
    with open(out_file, "w", encoding="utf-8") as f:
        json.dump(docs, f, ensure_ascii=False, indent=2, default=str)
    summary[col_name] = len(docs)
    print(f"  [OK] Exported {len(docs)} documents from '{col_name}' -> {out_file.name}")

meta = {
    "timestamp": datetime.now().isoformat(),
    "database": db_name,
    "collections": summary,
}
with open(out_dir / "_backup_metadata.json", "w", encoding="utf-8") as f:
    json.dump(meta, f, indent=2)

print(f"\nDatabase backup completed successfully in: {out_dir}")
