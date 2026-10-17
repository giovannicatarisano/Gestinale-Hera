import os
import json
from pathlib import Path
from dotenv import load_dotenv
import pymongo
import certifi

ROOT = Path(__file__).resolve().parent.parent
load_dotenv(ROOT / "backend" / ".env")

url = os.environ.get("MONGO_URL")
db_name = os.environ.get("DB_NAME", "hera_gestionale")

backup_dir = ROOT / "backups" / "database" / db_name

if not backup_dir.exists():
    print(f"Errore: Cartella di backup non trovata: {backup_dir}")
    exit(1)

print(f"Connessione a MongoDB Atlas -> Ripristino su DB: {db_name}...")
client = pymongo.MongoClient(url, tlsCAFile=certifi.where(), serverSelectionTimeoutMS=8000)
db = client[db_name]

json_files = [f for f in backup_dir.glob("*.json") if not f.name.startswith("_")]

for jf in json_files:
    col_name = jf.stem
    with open(jf, "r", encoding="utf-8") as f:
        docs = json.load(f)
    
    # Svuota e ripristina la collezione
    db[col_name].delete_many({})
    if docs:
        db[col_name].insert_many(docs)
    print(f"  [RIPRISTINATO] {len(docs)} documenti nella collezione '{col_name}'")

print(f"\n[SUCCESSO] Ripristino completato con successo da: {backup_dir}")
