import os
import sys
from pathlib import Path
from dotenv import load_dotenv
import pymongo
import certifi

sys.stdout.reconfigure(encoding="utf-8")

ROOT = Path(__file__).resolve().parent.parent

# 1. Correggi server.py
server_path = ROOT / "backend" / "server.py"
with open(server_path, "r", encoding="utf-8", errors="replace") as f:
    text = f.read()

replacements = {
    "â†’": "→",
    "âœ…": "✅",
    "â Œ": "❌",
    "âŒ": "❌",
    "Ã¨": "è",
    "Ã©": "é",
    "Ã²": "ò",
    "Ã ": "à",
    "Ã¹": "ù",
    "Ã¬": "ì",
    "Ã‰": "É",
    "Ã€": "À",
    "Ãˆ": "È",
    "Ã“": "Ó",
    "Ã": "à",
}

for bad, good in replacements.items():
    if bad in text:
        cnt = text.count(bad)
        print(f"server.py: sostituito '{bad}' -> '{good}' ({cnt} volte)")
        text = text.replace(bad, good)

with open(server_path, "w", encoding="utf-8") as f:
    f.write(text)

# 2. Correggi i record esistenti nel database (notifiche e swap_requests)
load_dotenv(ROOT / "backend" / ".env")
client = pymongo.MongoClient(os.environ["MONGO_URL"], tlsCAFile=certifi.where())
db = client[os.environ.get("DB_NAME", "hera_gestionale")]

notif_count = 0
for notif in db.notifications.find():
    msg = notif.get("message", "")
    new_msg = msg
    for bad, good in replacements.items():
        if bad in new_msg:
            new_msg = new_msg.replace(bad, good)
    # Fix anche eventuali caratteri non stampabili \x9d o 
    new_msg = new_msg.replace("\x9d", "❌").replace("", "❌").replace("", "")
    if new_msg != msg:
        db.notifications.update_one({"id": notif["id"]}, {"$set": {"message": new_msg}})
        notif_count += 1

print(f"Database: corrette {notif_count} notifiche con caratteri errati")

swap_count = 0
for sw in db.swap_requests.find():
    updates = {}
    for fld in ["note", "driver_response_note", "shift_label"]:
        val = sw.get(fld)
        if val and isinstance(val, str):
            new_val = val
            for bad, good in replacements.items():
                if bad in new_val:
                    new_val = new_val.replace(bad, good)
            new_val = new_val.replace("\x9d", "❌").replace("", "❌")
            if new_val != val:
                updates[fld] = new_val
    if updates:
        db.swap_requests.update_one({"id": sw["id"]}, {"$set": updates})
        swap_count += 1

print(f"Database: corrette {swap_count} richieste di cambio con caratteri errati")

# 3. Correggi file frontend
frontend_replacements = {
    "â†’": "→",
    "âœ…": "✅",
    "â Œ": "❌",
    "â€”": "—",
    "Ã¨": "è",
    "Ã©": "é",
    "Ã²": "ò",
    "Ã ": "à",
    "Ã¹": "ù",
    "Ã¬": "ì",
    "Ã‰": "É",
    "sarÃ\xa0": "sarà",
    "riceverÃ\xa0": "riceverà",
    "dovrÃ\xa0": "dovrà",
    "approverÃ\xa0": "approverà",
    "darÃ\xa0": "darà",
    "validitÃ\xa0": "validità",
    "VerrÃ\xa0": "Verrà",
}

for jsx in (ROOT / "frontend" / "src").rglob("*.jsx"):
    t = jsx.read_text(encoding="utf-8")
    mod = False
    for bad, good in frontend_replacements.items():
        if bad in t:
            t = t.replace(bad, good)
            mod = True
    if mod:
        jsx.write_text(t, encoding="utf-8")
        print(f"Frontend: corretto {jsx.name}")

