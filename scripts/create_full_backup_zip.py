import os
import zipfile
from pathlib import Path
from datetime import datetime

ROOT = Path(__file__).resolve().parent.parent
timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
out_zip = ROOT / "backups" / f"backup_gestionale_hera_{timestamp}_stable.zip"
out_zip.parent.mkdir(parents=True, exist_ok=True)

EXCLUDE_DIRS = {
    "node_modules", "venv", ".venv", "__pycache__", ".pytest_cache",
    ".git", ".gradle", "build", "dist", ".cache"
}

EXCLUDE_FILES = {
    "cloudflared.exe"  # 55MB binary not needed in source backup
}

print(f"Creating complete standalone backup archive...")
print(f"Destination: {out_zip}\n")

with zipfile.ZipFile(out_zip, "w", zipfile.ZIP_DEFLATED) as zipf:
    for root, dirs, files in os.walk(ROOT):
        # Filter directories in-place
        dirs[:] = [d for d in dirs if d not in EXCLUDE_DIRS and not d.startswith(".git")]
        
        rel_root = Path(root).relative_to(ROOT)
        
        # Don't recurse into backups folder itself
        if rel_root.parts and rel_root.parts[0] == "backups" and rel_root.parts != ("backups", "database", "hera_gestionale"):
            continue

        for file in files:
            if file in EXCLUDE_FILES or file.endswith(".zip"):
                continue
            full_path = Path(root) / file
            archive_name = full_path.relative_to(ROOT)
            zipf.write(full_path, archive_name)

size_mb = out_zip.stat().st_size / (1024 * 1024)
print(f"[OK] Full backup created successfully!")
print(f"  Archive: {out_zip.name}")
print(f"  Size: {size_mb:.2f} MB")
print(f"  Location: {out_zip}")
