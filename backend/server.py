from dotenv import load_dotenv
from pathlib import Path
import os

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

from fastapi import FastAPI, APIRouter, HTTPException, Request, Depends
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import logging
from pydantic import BaseModel, Field
from typing import List, Optional
import uuid
import bcrypt
import jwt
from datetime import datetime, timezone, timedelta, date

import certifi

mongo_url = os.environ.get('MONGO_URL', 'mongodb://localhost:27017')
if "mongodb+srv://" in mongo_url and "authsource=" not in mongo_url.lower():
    sep = "&" if "?" in mongo_url else "?"
    mongo_url = f"{mongo_url}{sep}authSource=admin"
is_tls = "mongodb+srv://" in mongo_url or "tls=true" in mongo_url.lower() or "ssl=true" in mongo_url.lower()
if is_tls:
    try:
        ca = certifi.where()
        client = AsyncIOMotorClient(mongo_url, tlsCAFile=ca, serverSelectionTimeoutMS=5000)
    except Exception:
        client = AsyncIOMotorClient(mongo_url, serverSelectionTimeoutMS=5000)
else:
    client = AsyncIOMotorClient(mongo_url, serverSelectionTimeoutMS=5000)
db_name = os.environ.get('DB_NAME', 'hera_gestionale')
db = client[db_name]

app = FastAPI(title="Hera Turni API")
api_router = APIRouter(prefix="/api")

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("hera")

# ---------------------------------------------------------------------------
# Costanti di sistema
# ---------------------------------------------------------------------------
JWT_ALGORITHM = "HS256"
JWT_SECRET = os.environ.get("JWT_SECRET", "hera_super_secret_jwt_key_2026_default")

SHIFT_SLOTS = {
    "presto": {"label": "Mattino Presto", "start": "05:30", "end": "11:50", "max_drivers": 3},
    "standard": {"label": "Mattino Standard", "start": "06:00", "end": "12:20", "max_drivers": None},
    "pomeriggio": {"label": "Pomeriggio", "start": "12:30", "end": "18:50", "max_drivers": None},
    "domenica": {"label": "Turno Domenica", "start": "06:00", "end": "12:20", "max_drivers": 3},
}
DAYS = ["Lunedì", "Martedì", "Mercoledì", "Giovedì", "Venerdì", "Sabato", "Domenica"]


# ---------------------------------------------------------------------------
# Funzioni di supporto per autenticazione e sicurezza
# ---------------------------------------------------------------------------
def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))


def create_access_token(user_id: str, email: str, role: str) -> str:
    payload = {
        "sub": user_id,
        "email": email,
        "role": role,
        "exp": datetime.now(timezone.utc) + timedelta(days=7),
        "type": "access",
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


async def get_current_user(request: Request) -> dict:
    token = None
    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        token = auth_header[7:]
    if not token:
        token = request.cookies.get("access_token")
    if not token:
        raise HTTPException(status_code=401, detail="Non autenticato")
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        user = await db.users.find_one({"id": payload["sub"]}, {"_id": 0, "password_hash": 0})
        if not user:
            raise HTTPException(status_code=401, detail="Utente non trovato")
        return user
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token scaduto")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Token non valido")


async def require_admin(user: dict = Depends(get_current_user)) -> dict:
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Accesso riservato agli amministratori")
    return user


async def require_staff(user: dict = Depends(get_current_user)) -> dict:
    if user.get("role") not in ("admin", "assistant"):
        raise HTTPException(status_code=403, detail="Accesso riservato al personale di gestione")
    return user


# ---------------------------------------------------------------------------
# Modelli dati (Pydantic)
# ---------------------------------------------------------------------------
class LoginInput(BaseModel):
    email: str
    password: str


class AssistantInput(BaseModel):
    name: str
    email: str
    password: str


class AssistantUpdateInput(BaseModel):
    name: Optional[str] = None
    email: Optional[str] = None
    password: Optional[str] = None


class Vehicle(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    plate: str
    type: str = "Compattatore"
    status: str = "available"  # "available" | "faulty" | "maintenance"
    fault_note: str = ""
    current_km: Optional[int] = 0
    last_km_updated_at: Optional[str] = None
    last_km_updated_by: Optional[str] = None
    maintenance_km_interval: Optional[int] = 20000  # Soglia tagliando programmato (km)
    last_service_km: Optional[int] = 0              # Km all'ultimo tagliando effettuato
    last_service_date: Optional[str] = None         # Data ultimo tagliando (YYYY-MM-DD)


class VehicleInput(BaseModel):
    name: str
    plate: str
    type: str = "Compattatore"
    status: str = "available"
    fault_note: str = ""
    current_km: Optional[int] = 0
    maintenance_km_interval: Optional[int] = 20000
    last_service_km: Optional[int] = 0
    last_service_date: Optional[str] = None


class ServiceRecordInput(BaseModel):
    service_km: Optional[int] = None
    service_date: Optional[str] = None
    notes: Optional[str] = ""
    next_interval: Optional[int] = None


class Route(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    code: str
    zone: str = ""
    vehicle_id: str = ""
    vehicle_assignment_mode: str = "fixed"  # "fixed" | "auto"
    allowed_vehicle_ids: List[str] = []     # opzionale per auto: limita a specifici mezzi se popolato
    slot: str
    schedule_mode: str = "fixed"  # "fixed" | "frequency"
    days: List[int] = []
    interval_days: int = 2
    start_date: Optional[str] = None
    pinned: bool = False


class RouteInput(BaseModel):
    name: str
    code: str
    zone: str = ""
    vehicle_id: str = ""
    vehicle_assignment_mode: str = "fixed"  # "fixed" | "auto"
    allowed_vehicle_ids: List[str] = []
    slot: str
    schedule_mode: str = "fixed"
    days: List[int] = []
    interval_days: int = 2
    start_date: Optional[str] = None
    pinned: bool = False


class License(BaseModel):
    name: str  # es. "B", "C", "CQC Merci", o testo personalizzato
    expiry_date: str  # YYYY-MM-DD


class MedicalItem(BaseModel):
    name: str          # es. "Disinfettante", "Bende sterili", "Cerotti", ecc.
    expiry_date: str   # YYYY-MM-DD
    notes: Optional[str] = ""
    needs_replacement: bool = False
    replacement_requested_at: Optional[str] = None  # ISO timestamp es. 2026-10-14T23:15:00Z
    replacement_note: Optional[str] = ""            # Note dell'autista sull'utilizzo


class MedicalKitInput(BaseModel):
    medical_kit: List[MedicalItem] = []


class MedicalReplacementRequestInput(BaseModel):
    item_name: str
    note: Optional[str] = ""


class MedicalCancelReplacementInput(BaseModel):
    item_name: str


class MedicalRestockInput(BaseModel):
    item_name: str
    new_expiry_date: str
    notes: Optional[str] = ""


class Driver(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    email: str = ""
    phone: str = ""
    active: bool = True
    group: str = ""   # "" | "gruppo1" | "gruppo2"
    licenses: List[License] = []
    medical_kit: List[MedicalItem] = []
    vehicle_skills: List[str] = []
    route_skills: List[str] = []


class DriverInput(BaseModel):
    name: str
    email: str = ""
    phone: str = ""
    active: bool = True
    group: str = ""   # "" | "gruppo1" | "gruppo2"
    licenses: List[License] = []
    medical_kit: List[MedicalItem] = []
    password: Optional[str] = None


class SkillsInput(BaseModel):
    vehicle_skills: List[str] = []
    route_skills: List[str] = []


class GenerateInput(BaseModel):
    week_start: str


class ShiftPatch(BaseModel):
    driver_id: Optional[str] = None
    vehicle_id: Optional[str] = None
    status: Optional[str] = None


class Absence(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    driver_id: str
    type: str = "ferie"  # "ferie" | "malattia" | "permesso"
    start_date: str
    end_date: str
    note: str = ""


class AbsenceInput(BaseModel):
    driver_id: str
    type: str = "ferie"
    start_date: str
    end_date: str
    note: str = ""


class CredentialsInput(BaseModel):
    password: str


# Costanti Checklist Hera
CHECKLIST_ITEMS_DEFAULT = [
    {"id": 1, "title": "Controllo integrità pedane cabina e maniglie salita"},
    {"id": 2, "title": "Controllo spie di segnalazione anomalie cruscotto mezzo e pannello controllo attrezzatura (assenza spie anomalie accese/messaggi di errore)"},
    {"id": 3, "title": "Controllo spie relative ai sistemi di informazione e avvertimento (assenza spie anomalie accese/messaggi di errore)"},
    {"id": 4, "title": "Funzionamento delle telecamere (se presenti)"},
    {"id": 5, "title": "Funzionamento dell'impianto frenante, compreso il freno di stazionamento"},
    {"id": 6, "title": "Integrità degli specchi retrovisori e di quelli esterni e funzionamento dei tergicristalli"},
    {"id": 7, "title": "Presenza del triangolo di emergenza"},
    {"id": 8, "title": "Controllo visivo che il mezzo e la relativa attrezzatura siano in sagoma"},
    {"id": 9, "title": "Controllo visivo presenza e integrità sistemi di informazione ed avvertimento (se presenti)"},
    {"id": 10, "title": "Per i veicoli carico posteriore, controllo integrità delle pedane posteriori (uomo presente) e del sistema di comunicazione tra autista e uomo in pedana"},
    {"id": 11, "title": "Controllo visivo dello stato dei pneumatici, usura e deformazioni visibili e dei relativi indicatori di serraggio se presenti"},
    {"id": 12, "title": "Funzionamento luci e segnalatori"},
    {"id": 13, "title": "Controllo visivo eventuali perdite liquidi/aria"},
    {"id": 14, "title": "Estintore (se presente): immediatamente utilizzabile, dispositivo di sicurezza per azionamenti accidentali correttamente inserito, indicatore di pressione indicante un valore compreso all'interno del campo verde"},
    {"id": 15, "title": "Pacchetto di medicazione"}
]


class ChecklistEntry(BaseModel):
    id: int
    title: str
    status: str = "C"  # "C" = Conforme, "NC" = Non Conforme
    notes: Optional[str] = ""


class StartChecklistInput(BaseModel):
    km_start: Optional[int] = None
    items: List[ChecklistEntry]
    notes: Optional[str] = ""


class EndChecklistInput(BaseModel):
    km_end: Optional[int] = None
    fuel_done: bool
    fuel_notes: Optional[str] = ""
    service_completed: bool
    service_notes: Optional[str] = ""
    items: List[ChecklistEntry]
    notes: Optional[str] = ""


class WeighingInput(BaseModel):
    net_weight: float = Field(..., ge=0, description="Peso netto in kg comunicato dalla pesa")
    destination: Optional[str] = "Akron"
    waste_type: str = Field(..., min_length=1, description="Tipologia rifiuto obbligatoria")
    entry_time: Optional[str] = ""
    exit_time: Optional[str] = ""
    duration_minutes: Optional[int] = None
    notes: Optional[str] = ""


class WeighingUpdateInput(BaseModel):
    net_weight: Optional[float] = Field(None, ge=0)
    destination: Optional[str] = None
    waste_type: Optional[str] = None
    entry_time: Optional[str] = None
    exit_time: Optional[str] = None
    duration_minutes: Optional[int] = None
    notes: Optional[str] = None


class SwapRequestInput(BaseModel):
    kind: str = "shift"  # "shift" | "week"
    shift_id: Optional[str] = None
    week_start: Optional[str] = None
    to_driver_id: str
    note: str = ""


class SwapDecision(BaseModel):
    status: str  # "approved" | "rejected"


class DriverSwapResponse(BaseModel):
    accepted: bool
    note: str = ""


class NotifRead(BaseModel):
    ids: Optional[List[str]] = None


# ---------------------------------------------------------------------------
# Endpoint di autenticazione
# ---------------------------------------------------------------------------
@api_router.post("/auth/login")
async def login(data: LoginInput):
    email = data.email.strip().lower()
    user = await db.users.find_one({"email": email})
    if not user or not verify_password(data.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Credenziali non valide")
    token = create_access_token(user["id"], user["email"], user["role"])
    return {
        "token": token,
        "user": {
            "id": user["id"],
            "email": user["email"],
            "name": user["name"],
            "role": user["role"],
            "driver_id": user.get("driver_id"),
        },
    }


@api_router.get("/auth/me")
async def me(user: dict = Depends(get_current_user)):
    return user


# ---------------------------------------------------------------------------
# Gestione assistenti / coordinatori (solo Amministratore)
# ---------------------------------------------------------------------------
@api_router.get("/assistants")
async def list_assistants(user: dict = Depends(require_admin)):
    return await db.users.find(
        {"role": "assistant"},
        {"_id": 0, "password_hash": 0}
    ).sort("created_at", -1).to_list(100)


@api_router.post("/assistants")
async def create_assistant(data: AssistantInput, user: dict = Depends(require_admin)):
    email = data.email.strip().lower()
    if not email:
        raise HTTPException(status_code=400, detail="Email obbligatoria")
    if not data.password or len(data.password.strip()) < 4:
        raise HTTPException(status_code=400, detail="Password troppo breve (minimo 4 caratteri)")
    existing = await db.users.find_one({"email": email})
    if existing:
        raise HTTPException(status_code=400, detail="Esiste già  un account con questa email")

    aid = str(uuid.uuid4())
    now_iso = datetime.now(timezone.utc).isoformat()
    new_user = {
        "id": aid,
        "name": data.name.strip(),
        "email": email,
        "password_hash": hash_password(data.password.strip()),
        "role": "assistant",
        "created_at": now_iso,
        "created_by": user.get("email"),
    }
    await db.users.insert_one(new_user)
    return {
        "id": aid,
        "name": new_user["name"],
        "email": new_user["email"],
        "role": "assistant",
        "created_at": now_iso,
    }


@api_router.put("/assistants/{aid}")
async def update_assistant(aid: str, data: AssistantUpdateInput, user: dict = Depends(require_admin)):
    target = await db.users.find_one({"id": aid})
    if not target:
        raise HTTPException(status_code=404, detail="Assistente non trovato")
    if target.get("role") != "assistant":
        raise HTTPException(status_code=403, detail="Modifica consentita solo per gli account assistente")

    updates = {}
    if data.name is not None and data.name.strip():
        updates["name"] = data.name.strip()
    if data.email is not None and data.email.strip():
        new_email = data.email.strip().lower()
        if new_email != target["email"]:
            exists = await db.users.find_one({"email": new_email})
            if exists:
                raise HTTPException(status_code=400, detail="Email già  utilizzata da un altro account")
            updates["email"] = new_email
    if data.password is not None and data.password.strip():
        if len(data.password.strip()) < 4:
            raise HTTPException(status_code=400, detail="Password troppo breve (minimo 4 caratteri)")
        updates["password_hash"] = hash_password(data.password.strip())

    if updates:
        await db.users.update_one({"id": aid}, {"$set": updates})

    return await db.users.find_one({"id": aid}, {"_id": 0, "password_hash": 0})


@api_router.delete("/assistants/{aid}")
async def delete_assistant(aid: str, user: dict = Depends(require_admin)):
    target = await db.users.find_one({"id": aid})
    if not target:
        raise HTTPException(status_code=404, detail="Assistente non trovato")
    if target.get("role") != "assistant":
        raise HTTPException(status_code=403, detail="Impossibile eliminare un account non-assistente")
    await db.users.delete_one({"id": aid})
    return {"ok": True, "message": "Assistente eliminato con successo"}



# ---------------------------------------------------------------------------
# Gestione Flotta e Mezzi
# ---------------------------------------------------------------------------
@api_router.get("/vehicles")
async def list_vehicles(user: dict = Depends(get_current_user)):
    return await db.vehicles.find({}, {"_id": 0}).to_list(1000)


@api_router.post("/vehicles")
async def create_vehicle(data: VehicleInput, user: dict = Depends(require_staff)):
    v = Vehicle(**data.model_dump())
    await db.vehicles.insert_one(v.model_dump())
    return v


@api_router.put("/vehicles/{vid}")
async def update_vehicle(vid: str, data: VehicleInput, user: dict = Depends(require_staff)):
    await db.vehicles.update_one({"id": vid}, {"$set": data.model_dump()})
    return await db.vehicles.find_one({"id": vid}, {"_id": 0})


@api_router.delete("/vehicles/{vid}")
async def delete_vehicle(vid: str, user: dict = Depends(require_staff)):
    await db.vehicles.delete_one({"id": vid})
    return {"ok": True}


@api_router.post("/vehicles/{vid}/service")
async def record_vehicle_service(vid: str, data: Optional[ServiceRecordInput] = None, user: dict = Depends(require_staff)):
    """Registra l'avvenuto tagliando/manutenzione programmata del mezzo, azzerando la soglia di allerta."""
    veh = await db.vehicles.find_one({"id": vid})
    if not veh:
        raise HTTPException(status_code=404, detail="Mezzo non trovato")

    current_km = veh.get("current_km") or 0
    service_km = data.service_km if (data and data.service_km is not None) else current_km
    service_date = (data and data.service_date) or datetime.now(timezone.utc).strftime("%Y-%m-%d")

    update_dict = {
        "last_service_km": service_km,
        "last_service_date": service_date,
    }
    if data and data.next_interval:
        update_dict["maintenance_km_interval"] = data.next_interval

    # Se il mezzo era fermo per manutenzione, lo ripristina disponibile
    if veh.get("status") == "maintenance":
        update_dict["status"] = "available"
        update_dict["fault_note"] = ""

    await db.vehicles.update_one({"id": vid}, {"$set": update_dict})
    return await db.vehicles.find_one({"id": vid}, {"_id": 0})


# ---------------------------------------------------------------------------
# Gestione Rotte e Giri di raccolta
# ---------------------------------------------------------------------------
@api_router.get("/routes")
async def list_routes(user: dict = Depends(get_current_user)):
    return await db.routes.find({}, {"_id": 0}).to_list(1000)


@api_router.post("/routes")
async def create_route(data: RouteInput, user: dict = Depends(require_staff)):
    r = Route(**data.model_dump())
    await db.routes.insert_one(r.model_dump())
    return r


@api_router.put("/routes/{rid}")
async def update_route(rid: str, data: RouteInput, user: dict = Depends(require_staff)):
    await db.routes.update_one({"id": rid}, {"$set": data.model_dump()})
    return await db.routes.find_one({"id": rid}, {"_id": 0})


@api_router.delete("/routes/{rid}")
async def delete_route(rid: str, user: dict = Depends(require_staff)):
    await db.routes.delete_one({"id": rid})
    return {"ok": True}


# ---------------------------------------------------------------------------
# Gestione Autisti
# ---------------------------------------------------------------------------
@api_router.get("/drivers")
async def list_drivers(user: dict = Depends(get_current_user)):
    drivers = await db.drivers.find({}, {"_id": 0}).to_list(1000)
    accounts = await db.users.find({"role": "driver"}, {"_id": 0, "driver_id": 1}).to_list(2000)
    linked = {a.get("driver_id") for a in accounts}
    for d in drivers:
        d["has_account"] = d["id"] in linked
    return drivers


async def _create_driver_account(driver: dict, password: str):
    email = (driver.get("email") or "").strip().lower()
    if not email:
        raise HTTPException(status_code=400, detail="Email autista obbligatoria per creare l'accesso")
    existing = await db.users.find_one({"email": email})
    if existing and existing.get("driver_id") != driver["id"]:
        raise HTTPException(status_code=400, detail="Email già  utilizzata da un altro account")
    if existing:
        await db.users.update_one({"email": email}, {"$set": {"password_hash": hash_password(password), "name": driver["name"]}})
    else:
        await db.users.insert_one({
            "id": str(uuid.uuid4()), "email": email, "password_hash": hash_password(password),
            "name": driver["name"], "role": "driver", "driver_id": driver["id"],
            "created_at": datetime.now(timezone.utc).isoformat(),
        })


@api_router.post("/drivers")
async def create_driver(data: DriverInput, user: dict = Depends(require_staff)):
    payload = data.model_dump()
    password = payload.pop("password", None)
    d = Driver(**payload)
    await db.drivers.insert_one(d.model_dump())
    if password:
        await _create_driver_account(d.model_dump(), password)
    return d


@api_router.put("/drivers/{did}")
async def update_driver(did: str, data: DriverInput, user: dict = Depends(require_staff)):
    payload = data.model_dump()
    password = payload.pop("password", None)
    await db.drivers.update_one({"id": did}, {"$set": payload})
    driver = await db.drivers.find_one({"id": did}, {"_id": 0})
    if password:
        await _create_driver_account(driver, password)
    else:
        # Mantiene sincronizzati nome ed email dell'account collegato
        await db.users.update_one({"driver_id": did}, {"$set": {"name": driver["name"]}})
    return driver


@api_router.put("/drivers/{did}/medical-kit")
async def update_driver_medical_kit(did: str, data: MedicalKitInput, user: dict = Depends(require_staff)):
    driver = await db.drivers.find_one({"id": did}, {"_id": 0})
    if not driver:
        raise HTTPException(status_code=404, detail="Autista non trovato")
    kit_list = [item.model_dump() for item in data.medical_kit]
    await db.drivers.update_one({"id": did}, {"$set": {"medical_kit": kit_list}})
    updated = await db.drivers.find_one({"id": did}, {"_id": 0})
    return updated


@api_router.post("/drivers/{did}/medical-kit/request-replacement")
async def request_medical_kit_replacement(
    did: str,
    data: MedicalReplacementRequestInput,
    user: dict = Depends(get_current_user),
):
    # Consenti solo all'autista interessato o allo staff (admin/assistente)
    if user.get("role") not in ("admin", "assistant") and user.get("driver_id") != did:
        raise HTTPException(status_code=403, detail="Non autorizzato a modificare questo kit medico")

    driver = await db.drivers.find_one({"id": did}, {"_id": 0})
    if not driver:
        raise HTTPException(status_code=404, detail="Autista non trovato")

    kit = driver.get("medical_kit") or []
    item_found = False
    now_iso = datetime.now(timezone.utc).isoformat()

    for item in kit:
        if item.get("name") == data.item_name:
            item["needs_replacement"] = True
            item["replacement_requested_at"] = now_iso
            item["replacement_note"] = (data.note or "").strip()
            item_found = True
            break

    if not item_found:
        # Se non è in elenco, aggiungiamolo come presidio con reintegro richiesto
        kit.append({
            "name": data.item_name,
            "expiry_date": "",
            "notes": "",
            "needs_replacement": True,
            "replacement_requested_at": now_iso,
            "replacement_note": (data.note or "").strip(),
        })

    await db.drivers.update_one({"id": did}, {"$set": {"medical_kit": kit}})

    # Invia notifica agli amministratori
    note_text = f" Note: \"{data.note.strip()}\"" if (data.note or "").strip() else ""
    await db.notifications.insert_one({
        "id": str(uuid.uuid4()),
        "target_role": "admin",
        "driver_id": did,
        "title": "Richiesta reintegro Kit Medico",
        "message": f"L'autista {driver.get('name', 'Sconosciuto')} ha segnalato l'utilizzo di '{data.item_name}' e ne richiede la sostituzione.{note_text}",
        "category": "medical_kit",
        "created_at": now_iso,
        "read": False,
    })

    updated = await db.drivers.find_one({"id": did}, {"_id": 0})
    return updated


@api_router.post("/drivers/{did}/medical-kit/cancel-replacement")
async def cancel_medical_kit_replacement(
    did: str,
    data: MedicalCancelReplacementInput,
    user: dict = Depends(get_current_user),
):
    if user.get("role") not in ("admin", "assistant") and user.get("driver_id") != did:
        raise HTTPException(status_code=403, detail="Non autorizzato")

    driver = await db.drivers.find_one({"id": did}, {"_id": 0})
    if not driver:
        raise HTTPException(status_code=404, detail="Autista non trovato")

    kit = driver.get("medical_kit") or []
    target_name = (data.item_name or "").strip().lower()
    for item in kit:
        if (item.get("name") or "").strip().lower() == target_name:
            item["needs_replacement"] = False
            item["replacement_requested_at"] = None
            item["replacement_note"] = ""
            break

    await db.drivers.update_one({"id": did}, {"$set": {"medical_kit": kit}})
    updated = await db.drivers.find_one({"id": did}, {"_id": 0})
    return updated


@api_router.post("/drivers/{did}/medical-kit/restock")
async def restock_medical_kit_item(
    did: str,
    data: MedicalRestockInput,
    user: dict = Depends(require_staff),
):
    driver = await db.drivers.find_one({"id": did}, {"_id": 0})
    if not driver:
        raise HTTPException(status_code=404, detail="Autista non trovato")

    kit = driver.get("medical_kit") or []
    now_iso = datetime.now(timezone.utc).isoformat()
    target_name = (data.item_name or "").strip().lower()
    for item in kit:
        if (item.get("name") or "").strip().lower() == target_name:
            item["needs_replacement"] = False
            item["replacement_requested_at"] = None
            item["replacement_note"] = ""
            if data.new_expiry_date:
                item["expiry_date"] = data.new_expiry_date
            if data.notes:
                item["notes"] = data.notes
            break

    await db.drivers.update_one({"id": did}, {"$set": {"medical_kit": kit}})

    # Notifica all'autista sul telefono
    await db.notifications.insert_one({
        "id": str(uuid.uuid4()),
        "target_role": "driver",
        "driver_id": did,
        "title": "Presidio Kit Medico reintegrato",
        "message": f"Il presidio '{data.item_name}' del tuo kit medico è stato sostituito/reintegrato.{' Nuova scadenza: ' + data.new_expiry_date if data.new_expiry_date else ''}",
        "category": "medical_kit",
        "created_at": now_iso,
        "read": False,
    })

    updated = await db.drivers.find_one({"id": did}, {"_id": 0})
    return updated


@api_router.post("/drivers/{did}/credentials")
async def set_driver_credentials(did: str, data: CredentialsInput, user: dict = Depends(require_staff)):
    driver = await db.drivers.find_one({"id": did}, {"_id": 0})
    if not driver:
        raise HTTPException(status_code=404, detail="Autista non trovato")
    if len(data.password) < 4:
        raise HTTPException(status_code=400, detail="La password deve avere almeno 4 caratteri")
    await _create_driver_account(driver, data.password)
    return {"ok": True, "email": (driver.get("email") or "").strip().lower()}


@api_router.delete("/drivers/{did}")
async def delete_driver(did: str, user: dict = Depends(require_staff)):
    await db.drivers.delete_one({"id": did})
    await db.users.delete_many({"driver_id": did, "role": "driver"})
    return {"ok": True}


@api_router.put("/drivers/{did}/skills")
async def update_skills(did: str, data: SkillsInput, user: dict = Depends(require_staff)):
    await db.drivers.update_one({"id": did}, {"$set": data.model_dump()})
    return await db.drivers.find_one({"id": did}, {"_id": 0})


# ---------------------------------------------------------------------------
# Gestione Assenze (ferie, malattia, permessi)
# ---------------------------------------------------------------------------
@api_router.get("/absences")
async def list_absences(user: dict = Depends(get_current_user)):
    return await db.absences.find({}, {"_id": 0}).to_list(2000)


@api_router.post("/absences")
async def create_absence(data: AbsenceInput, user: dict = Depends(require_staff)):
    if data.end_date < data.start_date:
        raise HTTPException(status_code=400, detail="La data di fine precede la data di inizio")
    a = Absence(**data.model_dump())
    await db.absences.insert_one(a.model_dump())
    return a


@api_router.put("/absences/{aid}")
async def update_absence(aid: str, data: AbsenceInput, user: dict = Depends(require_staff)):
    if data.end_date < data.start_date:
        raise HTTPException(status_code=400, detail="La data di fine precede la data di inizio")
    await db.absences.update_one({"id": aid}, {"$set": data.model_dump()})
    return await db.absences.find_one({"id": aid}, {"_id": 0})


@api_router.delete("/absences/{aid}")
async def delete_absence(aid: str, user: dict = Depends(require_staff)):
    await db.absences.delete_one({"id": aid})
    return {"ok": True}


def _absent_ids_on(absences: list, date_iso: str) -> set:
    return {a["driver_id"] for a in absences if a["start_date"] <= date_iso <= a["end_date"]}


# ---------------------------------------------------------------------------
# Gestione Turni e Algoritmo di Assegnazione
# ---------------------------------------------------------------------------
@api_router.get("/shifts")
async def list_shifts(week_start: str, user: dict = Depends(get_current_user)):
    return await db.shifts.find({"week_start": week_start}, {"_id": 0}).to_list(5000)


def _driver_can_sync(driver: dict, route: dict, available_vehicles: list = None) -> tuple[bool, Optional[str]]:
    """
    Check if a driver can operate a route.
    Returns (can_operate: bool, chosen_vehicle_id: Optional[str]).
    - If route has vehicle_assignment_mode == "auto":
      Selects the first available vehicle (status=="available") to which the driver is trained,
      respecting allowed_vehicle_ids if configured.
    - If route has a fixed vehicle:
      Requires the driver to be trained on it. If that vehicle is faulty, can optionally fallback
      to another available vehicle the driver is trained on.
    """
    route_id = route.get("id")
    if route_id not in driver.get("route_skills", []):
        return False, None

    vehicle_skills = driver.get("vehicle_skills", [])
    mode = route.get("vehicle_assignment_mode", "fixed")
    fixed_vid = route.get("vehicle_id")

    # Se viene fornito l'elenco dei mezzi disponibili, esclude i mezzi guasti
    if available_vehicles is not None:
        avail_map = {v["id"]: v for v in available_vehicles if v.get("status", "available") == "available"}
    else:
        avail_map = None

    if mode == "auto":
        allowed = set(route.get("allowed_vehicle_ids") or [])
        # Trova il primo mezzo compatibile con l'autista e attualmente disponibile
        if avail_map is not None:
            for vid in vehicle_skills:
                if vid in avail_map and (not allowed or vid in allowed):
                    return True, vid
            return False, None
        else:
            for vid in vehicle_skills:
                if not allowed or vid in allowed:
                    return True, vid
            return False, None

    # Modalità  veicolo fisso
    if fixed_vid in vehicle_skills:
        # Verifica disponibilità  del mezzo fisso assegnato
        if avail_map is not None:
            if fixed_vid in avail_map:
                return True, fixed_vid
            # Mezzo fisso non disponibile (guasto): ricerca mezzo compatibile di riserva
            for vid in vehicle_skills:
                if vid in avail_map:
                    return True, vid
            return False, None
        return True, fixed_vid

    return False, None


async def _driver_can(driver: dict, route: dict, available_vehicles: list = None) -> bool:
    can, _ = _driver_can_sync(driver, route, available_vehicles)
    return can


async def notify(driver_id: str, message: str, kind: str = "shift", shift_id: str = None):
    """Notify a driver (by driver_id). Pass driver_id=None to skip."""
    if not driver_id:
        return
    await db.notifications.insert_one({
        "id": str(uuid.uuid4()),
        "driver_id": driver_id,
        "kind": kind,
        "message": message,
        "shift_id": shift_id,
        "read": False,
        "created_at": datetime.now(timezone.utc).isoformat(),
    })


async def notify_admins(message: str, kind: str = "swap", shift_id: str = None):
    """Broadcast a notification to all admin and assistant users (including those added in the future)."""
    await db.notifications.insert_one({
        "id": str(uuid.uuid4()),
        "target_role": "staff",
        "user_id": None,
        "driver_id": None,
        "kind": kind,
        "message": message,
        "shift_id": shift_id,
        "read": False,
        "read_by": [],
        "created_at": datetime.now(timezone.utc).isoformat(),
    })


async def _shift_label(shift: dict) -> str:
    route = await db.routes.find_one({"id": shift["route_id"]}, {"_id": 0})
    slot = SHIFT_SLOTS.get(shift["slot"], {}).get("label", shift["slot"])
    day = DAYS[shift["day"]] if 0 <= shift["day"] < len(DAYS) else ""
    return f"{route['name'] if route else 'Giro'} Â· {day} Â· {slot}"


def route_days_for_week(route: dict, week_start: str) -> list:
    """Compute weekday indexes (0=Mon..6=Sun) a route runs in the given week."""
    slot = route.get("slot")
    allowed = [6] if slot == "domenica" else [0, 1, 2, 3, 4, 5]
    if route.get("schedule_mode") == "frequency":
        interval = max(1, int(route.get("interval_days") or 1))
        monday = datetime.strptime(week_start, "%Y-%m-%d").date()
        start_d = None
        if route.get("start_date"):
            try:
                start_d = datetime.strptime(route["start_date"], "%Y-%m-%d").date()
            except ValueError:
                start_d = None
        res = []
        for i in range(7):
            if i not in allowed:
                continue
            d = monday + timedelta(days=i)
            if start_d is None:
                if i % interval == 0:
                    res.append(i)
            elif d >= start_d and (d - start_d).days % interval == 0:
                res.append(i)
        return res
    return [d for d in route.get("days", []) if d in allowed]


ROTATION_SLOTS = ["presto", "standard", "pomeriggio"]
ROTATION_EPOCH = date(2026, 1, 5)  # Lunedì di riferimento iniziale

# Fasce orarie considerate mattina (assegnate al gruppo del mattino nella settimana)
MATTINA_SLOTS = {"presto", "standard"}
POMERIGGIO_SLOTS = {"pomeriggio"}


def week_index(week_start: str) -> int:
    monday = datetime.strptime(week_start, "%Y-%m-%d").date()
    return (monday - ROTATION_EPOCH).days // 7


def group_slot_for_week(group: str, week_start: str) -> Optional[str]:
    """
    Return the SLOT CATEGORY assigned to this group for the given week.
    Even week_index  → gruppo1=mattina, gruppo2=pomeriggio
    Odd  week_index  → gruppo1=pomeriggio, gruppo2=mattina
    Returns None for drivers without a group (no constraint).
    """
    if not group:
        return None
    wi = week_index(week_start)
    if wi % 2 == 0:
        return "mattina" if group == "gruppo1" else "pomeriggio"
    else:
        return "pomeriggio" if group == "gruppo1" else "mattina"


def weekly_slot_map(week_start: str, drivers: list) -> dict:
    """
    Assign each active driver a concrete slot for the week.
    - Drivers with a group get the slot their group is scheduled for.
    - Morning group drivers: up to max_drivers (3) assigned to 'presto', others to 'standard'.
    - L'autista del mattino presto non si alterna con mattino standard in automatico.
    - Drivers without a group keep round-robin rotation.
    """
    wi = week_index(week_start)
    ungrouped = sorted([d for d in drivers if not d.get("group")], key=lambda d: d["id"])
    result = {}

    grouped_morning = sorted(
        [d for d in drivers if d.get("group") and group_slot_for_week(d.get("group"), week_start) == "mattina"],
        key=lambda d: d["id"]
    )
    grouped_afternoon = [d for d in drivers if d.get("group") and group_slot_for_week(d.get("group"), week_start) == "pomeriggio"]

    for d in grouped_afternoon:
        result[d["id"]] = "pomeriggio"

    max_presto = SHIFT_SLOTS.get("presto", {}).get("max_drivers") or 3
    num_morning = len(grouped_morning)
    if num_morning <= max_presto:
        for d in grouped_morning:
            result[d["id"]] = "standard"
    else:
        offset = (wi * max_presto) % num_morning
        presto_indices = set((offset + i) % num_morning for i in range(max_presto))
        for i, d in enumerate(grouped_morning):
            result[d["id"]] = "presto" if i in presto_indices else "standard"

    for d in ungrouped:
        idx = ungrouped.index(d)
        result[d["id"]] = ROTATION_SLOTS[(idx + wi) % len(ROTATION_SLOTS)]
    return result


@api_router.get("/rotation")
async def get_rotation(week_start: str, user: dict = Depends(get_current_user)):
    drivers = [d for d in await db.drivers.find({}, {"_id": 0}).to_list(1000) if d.get("active", True)]
    smap = weekly_slot_map(week_start, drivers)
    wi = week_index(week_start)
    # Determina l'assegnazione mattina/pomeriggio dei gruppi per la settimana
    g1_cat = "mattina" if wi % 2 == 0 else "pomeriggio"
    g2_cat = "pomeriggio" if wi % 2 == 0 else "mattina"
    return {
        "week_start": week_start,
        "week_index": wi,
        "week_parity": "pari" if wi % 2 == 0 else "dispari",
        "gruppo1_turno": g1_cat,
        "gruppo2_turno": g2_cat,
        "rotation": [
            {
                "driver_id": d["id"],
                "name": d["name"],
                "group": d.get("group", ""),
                "slot": smap.get(d["id"]),
                "group_category": group_slot_for_week(d.get("group", ""), week_start),
            }
            for d in drivers
        ],
    }


@api_router.post("/shifts/generate")
async def generate_shifts(data: GenerateInput, user: dict = Depends(require_staff)):
    week_start = data.week_start
    await db.shifts.delete_many({"week_start": week_start})

    vehicles = await db.vehicles.find({}, {"_id": 0}).to_list(1000)
    routes = await db.routes.find({}, {"_id": 0}).to_list(1000)
    drivers = [d for d in await db.drivers.find({}, {"_id": 0}).to_list(1000) if d.get("active", True)]
    absences = await db.absences.find({}, {"_id": 0}).to_list(2000)
    monday = datetime.strptime(week_start, "%Y-%m-%d").date()

    # Rotazione settimanale: ciascun autista mantiene la stessa fascia oraria per tutta la settimana
    wslot = weekly_slot_map(week_start, drivers)

    week_load = {d["id"]: 0 for d in drivers}
    day_taken = {}            # (day, driver_id) -> True
    day_vehicle_taken = {}    # (day, slot, vehicle_id) -> True (evita doppio uso dello stesso mezzo nello stesso slot)
    cap_count = {}            # (day, slot) -> int   (conteggio autisti per slot con limite capienza)
    pom_days = {}             # giorni con turno pomeridiano per la verifica del riposo minimo obbligatorio
    shifts = []

    # Ordine di assegnazione: prima pomeriggio (per calcolare il riposo del giorno seguente),
    # poi presto, standard, rotazione e infine domenica. I turni bloccati hanno priorità .
    phase = {"pomeriggio": 0, "presto": 1, "standard": 2, "rotazione": 3, "domenica": 4}

    def sort_key(r):
        return (phase.get(r["slot"], 9), not r.get("pinned", False))

    for route in sorted(routes, key=sort_key):
        route_slot = route["slot"]
        for day in route_days_for_week(route, week_start):
            date_iso = (monday + timedelta(days=day)).isoformat()
            absent = _absent_ids_on(absences, date_iso)
            assigned = None
            final_slot = route_slot
            final_vehicle_id = route.get("vehicle_id") or ""

            # Se il giro è a rotazione libera, valuta sia lo slot standard che il pomeriggio
            slots_to_try = ["standard", "pomeriggio"] if route_slot == "rotazione" else [route_slot]

            best_candidate = None
            best_slot = slots_to_try[0]
            best_vehicle_id = final_vehicle_id
            min_load = 999

            for slot in slots_to_try:
                max_d = SHIFT_SLOTS.get(slot, {}).get("max_drivers")
                slot_full = max_d is not None and cap_count.get((day, slot), 0) >= max_d
                if slot_full:
                    continue

                early = slot in ("presto", "domenica")
                candidates = []
                # Mezzi disponibili per questo giorno e orario
                available_for_slot = [
                    v for v in vehicles
                    if v.get("status", "available") == "available" and not day_vehicle_taken.get((day, slot, v["id"]))
                ]

                for d in drivers:
                    did = d["id"]
                    can, chosen_vid = _driver_can_sync(d, route, available_for_slot)
                    if not can:
                        continue
                    if day_taken.get((day, did)) or did in absent:
                        continue
                    # Vincolo di fascia oraria: ciascun autista mantiene la fascia oraria assegnata (presto, standard o pomeriggio)
                    # L'autista del mattino presto non si alterna con mattino standard in automatico
                    if slot != "domenica":
                        if wslot.get(did) != slot:
                            continue
                    # Verifica rispetto vincolo riposo 11 ore
                    if early and (day - 1) in pom_days.get(did, set()):
                        continue
                    candidates.append((d, chosen_vid))

                if candidates:
                    candidates.sort(key=lambda item: week_load[item[0]["id"]])
                    top_cand, top_vid = candidates[0]
                    cand_load = week_load[top_cand["id"]]
                    if cand_load < min_load:
                        min_load = cand_load
                        best_candidate = top_cand
                        best_slot = slot
                        best_vehicle_id = top_vid or final_vehicle_id

            assigned = best_candidate
            final_slot = best_slot if (route_slot == "rotazione" and best_candidate) else (route_slot if route_slot != "rotazione" else "standard")
            if best_vehicle_id:
                final_vehicle_id = best_vehicle_id

            now_iso = datetime.now(timezone.utc).isoformat()
            creator_name = user.get("name") or user.get("email")
            creator_role = user.get("role")
            shift = {
                "id": str(uuid.uuid4()),
                "week_start": week_start,
                "day": day,
                "slot": final_slot,
                "route_id": route["id"],
                "vehicle_id": final_vehicle_id,
                "driver_id": assigned["id"] if assigned else None,
                "status": "assigned" if assigned else "uncovered",
                "pinned": route.get("pinned", False),
                "recovery": False,
                "created_by": creator_name,
                "created_by_role": creator_role,
                "created_at": now_iso,
                "history": [
                    {
                        "action": "generated",
                        "by": creator_name,
                        "role": creator_role,
                        "at": now_iso,
                        "detail": f"Assegnazione iniziale ({'Coperto: ' + assigned['name'] if assigned else 'Scoperto'})"
                    }
                ]
            }
            shifts.append(shift)
            if assigned:
                week_load[assigned["id"]] += 1
                day_taken[(day, assigned["id"])] = True
                if final_vehicle_id:
                    day_vehicle_taken[(day, final_slot, final_vehicle_id)] = True
                if final_slot == "pomeriggio":
                    pom_days.setdefault(assigned["id"], set()).add(day)
                max_d = SHIFT_SLOTS.get(final_slot, {}).get("max_drivers")
                if max_d is not None:
                    cap_count[(day, final_slot)] = cap_count.get((day, final_slot), 0) + 1

    if shifts:
        await db.shifts.insert_many(shifts)
    covered = len([s for s in shifts if s["driver_id"]])
    unassigned = [d["name"] for d in drivers if week_load[d["id"]] == 0]
    return {
        "total": len(shifts),
        "covered": covered,
        "uncovered": len(shifts) - covered,
        "unassigned_drivers": unassigned,
    }


@api_router.post("/shifts/{sid}/recover")
async def recover_shift(sid: str, user: dict = Depends(require_staff)):
    """Re-propose a skipped/uncovered route on the next available day."""
    shift = await db.shifts.find_one({"id": sid}, {"_id": 0})
    if not shift:
        raise HTTPException(status_code=404, detail="Turno non trovato")
    route = await db.routes.find_one({"id": shift["route_id"]}, {"_id": 0})
    slot = shift["slot"]
    next_day = min(shift["day"] + 1, 6)
    if slot == "domenica":
        next_day = 6

    drivers = [d for d in await db.drivers.find({}, {"_id": 0}).to_list(1000) if d.get("active", True)]
    day_shifts = await db.shifts.find({"week_start": shift["week_start"], "day": next_day}, {"_id": 0}).to_list(5000)
    busy = {s["driver_id"] for s in day_shifts if s["driver_id"]}
    absences = await db.absences.find({}, {"_id": 0}).to_list(2000)
    monday = datetime.strptime(shift["week_start"], "%Y-%m-%d").date()
    absent = _absent_ids_on(absences, (monday + timedelta(days=next_day)).isoformat())
    max_d = SHIFT_SLOTS.get(slot, {}).get("max_drivers")
    cap = len([s for s in day_shifts if s["slot"] == slot and s["driver_id"]])

    assigned = None
    if not (max_d is not None and cap >= max_d):
        cands = [d for d in drivers if route and await _driver_can(d, route) and d["id"] not in busy and d["id"] not in absent]
        if cands:
            assigned = cands[0]

    now_iso = datetime.now(timezone.utc).isoformat()
    user_name = user.get("name") or user.get("email")
    user_role = user.get("role")

    new_shift = {
        "id": str(uuid.uuid4()),
        "week_start": shift["week_start"],
        "day": next_day,
        "slot": slot,
        "route_id": shift["route_id"],
        "vehicle_id": shift["vehicle_id"],
        "driver_id": assigned["id"] if assigned else None,
        "status": "assigned" if assigned else "uncovered",
        "pinned": shift.get("pinned", False),
        "recovery": True,
        "created_by": user_name,
        "created_by_role": user_role,
        "created_at": now_iso,
        "history": [
            {
                "action": "recovered",
                "by": user_name,
                "role": user_role,
                "at": now_iso,
                "detail": f"Creato come recupero dal turno originale del giorno {shift['day']}"
            }
        ]
    }
    await db.shifts.insert_one(new_shift)
    await db.shifts.update_one(
        {"id": sid},
        {
            "$set": {
                "status": "recovered",
                "last_modified_by": user_name,
                "last_modified_role": user_role,
                "last_modified_at": now_iso,
            },
            "$push": {
                "history": {
                    "action": "marked_recovered",
                    "by": user_name,
                    "role": user_role,
                    "at": now_iso,
                    "detail": f"Turno riprogrammato al giorno {next_day}"
                }
            }
        }
    )
    new_shift.pop("_id", None)
    if assigned:
        await notify(assigned["id"], f"Turno di recupero assegnato: {await _shift_label(new_shift)}", "shift", new_shift["id"])
    return new_shift


@api_router.get("/shifts/{sid}/substitutes")
async def substitutes(sid: str, user: dict = Depends(require_staff)):
    shift = await db.shifts.find_one({"id": sid}, {"_id": 0})
    if not shift:
        raise HTTPException(status_code=404, detail="Turno non trovato")
    route = await db.routes.find_one({"id": shift["route_id"]}, {"_id": 0})
    drivers = [d for d in await db.drivers.find({}, {"_id": 0}).to_list(1000) if d.get("active", True)]

    # Autisti già  impegnati nella giornata
    day_shifts = await db.shifts.find(
        {"week_start": shift["week_start"], "day": shift["day"]}, {"_id": 0}
    ).to_list(5000)
    busy = {s["driver_id"] for s in day_shifts if s["driver_id"] and s["id"] != sid}
    week_shifts = await db.shifts.find({"week_start": shift["week_start"]}, {"_id": 0}).to_list(5000)
    load = {}
    for s in week_shifts:
        if s["driver_id"]:
            load[s["driver_id"]] = load.get(s["driver_id"], 0) + 1

    absences = await db.absences.find({}, {"_id": 0}).to_list(2000)
    monday = datetime.strptime(shift["week_start"], "%Y-%m-%d").date()
    date_iso = (monday + timedelta(days=shift["day"])).isoformat()
    absent = _absent_ids_on(absences, date_iso)

    results = []
    for d in drivers:
        if d["id"] == shift.get("driver_id"):
            continue
        qualified = await _driver_can(d, route) if route else False
        is_absent = d["id"] in absent
        available = d["id"] not in busy and not is_absent
        results.append({
            "id": d["id"],
            "name": d["name"],
            "qualified": qualified,
            "available": available,
            "absent": is_absent,
            "week_load": load.get(d["id"], 0),
            "vehicle_ok": route and route["vehicle_id"] in d.get("vehicle_skills", []),
            "route_ok": route and route["id"] in d.get("route_skills", []),
        })
    # Criterio di scelta: prima abilitati e disponibili, poi abilitati, infine per carico di turni
    results.sort(key=lambda r: (not (r["qualified"] and r["available"]), not r["qualified"], r["week_load"]))
    return {"shift": shift, "route": route, "candidates": results}


@api_router.patch("/shifts/{sid}")
async def patch_shift(sid: str, data: ShiftPatch, user: dict = Depends(require_staff)):
    shift = await db.shifts.find_one({"id": sid}, {"_id": 0})
    if not shift:
        raise HTTPException(status_code=404, detail="Turno non trovato")
    prev_driver = shift.get("driver_id")
    update = {}
    detail_parts = []
    if "driver_id" in data.model_fields_set:
        update["driver_id"] = data.driver_id
        update["status"] = "assigned" if data.driver_id else "uncovered"
        new_driver = data.driver_id
        if data.driver_id:
            d_doc = await db.drivers.find_one({"id": data.driver_id}, {"_id": 0, "name": 1})
            detail_parts.append(f"Nuovo autista: {d_doc['name'] if d_doc else data.driver_id}")
        else:
            detail_parts.append("Autista rimosso (turno scoperto)")
    if "vehicle_id" in data.model_fields_set and data.vehicle_id is not None:
        update["vehicle_id"] = data.vehicle_id
        v_doc = await db.vehicles.find_one({"id": data.vehicle_id}, {"_id": 0, "plate": 1})
        detail_parts.append(f"Mezzo: {v_doc['plate'] if v_doc else data.vehicle_id}")
    if data.status is not None:
        update["status"] = data.status
        if data.status == "absence":
            update["driver_id"] = None
            new_driver = None
            detail_parts.append("Segnata assenza autista")
        elif data.status != shift.get("status"):
            detail_parts.append(f"Stato: {data.status}")

    user_name = user.get("name") or user.get("email")
    user_role = user.get("role")
    now_iso = datetime.now(timezone.utc).isoformat()

    update["last_modified_by"] = user_name
    update["last_modified_role"] = user_role
    update["last_modified_at"] = now_iso

    history_entry = {
        "action": "manual_update",
        "by": user_name,
        "role": user_role,
        "at": now_iso,
        "detail": " Â· ".join(detail_parts) if detail_parts else "Parametri turno aggiornati"
    }

    await db.shifts.update_one(
        {"id": sid},
        {
            "$set": update,
            "$push": {"history": history_entry}
        }
    )
    updated = await db.shifts.find_one({"id": sid}, {"_id": 0})

    # Invio notifiche automatiche per variazioni di turno
    if new_driver != prev_driver:
        label = await _shift_label(updated)
        if prev_driver:
            await notify(prev_driver, f"Sei stato rimosso dal turno: {label}", "shift", sid)
        if new_driver:
            await notify(new_driver, f"Ti è stato assegnato un nuovo turno: {label}", "shift", sid)
    return updated



# ---------------------------------------------------------------------------
# Gestione Checklist Servizio (Inizio e Fine Turno)
# ---------------------------------------------------------------------------

@api_router.get("/checklist/template")
async def get_checklist_template():
    """Restituisce l'elenco ufficiale delle 15 voci di controllo Hera."""
    return {"items": CHECKLIST_ITEMS_DEFAULT}


@api_router.post("/shifts/{sid}/start-checklist")
async def submit_start_checklist(sid: str, data: StartChecklistInput, user: dict = Depends(get_current_user)):
    """Registra la checklist di inizio servizio (pre-partenza) compilata dall'autista o dallo staff."""
    shift = await db.shifts.find_one({"id": sid})
    if not shift:
        raise HTTPException(status_code=404, detail="Turno non trovato")

    # Autorizzazione: o è l'autista titolare del turno o è un membro dello staff
    if user.get("role") == "driver" and user.get("driver_id") != shift.get("driver_id"):
        raise HTTPException(status_code=403, detail="Non sei l'autista assegnato a questo turno")

    now_iso = datetime.now(timezone.utc).isoformat()
    start_data = {
        "submitted_at": now_iso,
        "submitted_by_user": user.get("name") or user.get("email"),
        "km_start": data.km_start,
        "items": [item.dict() for item in data.items],
        "notes": data.notes or "",
        "has_anomalies": any(item.status == "NC" for item in data.items)
    }

    await db.shifts.update_one(
        {"id": sid},
        {"$set": {"start_checklist": start_data}}
    )

    # Aggiornamento in tempo reale del contachilometri del mezzo assegnato
    vehicle_id = shift.get("vehicle_id")
    if vehicle_id and data.km_start is not None and data.km_start > 0:
        v_update = {
            "last_km_updated_at": now_iso,
            "last_km_updated_by": user.get("name") or user.get("email") or "Autista"
        }
        veh = await db.vehicles.find_one({"id": vehicle_id})
        if veh:
            prev_km = veh.get("current_km") or 0
            if data.km_start >= prev_km:
                v_update["current_km"] = data.km_start
            await db.vehicles.update_one({"id": vehicle_id}, {"$set": v_update})

    # Se ci sono non conformità, notifica immediatamente lo staff
    anomalies = [item for item in data.items if item.status == "NC"]
    if anomalies:
        driver_name = user.get("name") or "Autista"
        vehicle = await db.vehicles.find_one({"id": shift.get("vehicle_id")})
        veh_name = vehicle.get("name") if vehicle else "mezzo assegnato"
        details = ", ".join([f"{a.title[:30]}... ({a.notes or 'NC'})" for a in anomalies[:2]])
        await notify_admins(
            message=f"⚠️ {driver_name} ha segnalato {len(anomalies)} NC a inizio turno ({veh_name}): {details}",
            kind="checklist_anomaly",
            shift_id=sid
        )

    updated = await db.shifts.find_one({"id": sid}, {"_id": 0})
    return updated


@api_router.post("/shifts/{sid}/end-checklist")
async def submit_end_checklist(sid: str, data: EndChecklistInput, user: dict = Depends(get_current_user)):
    """Registra la checklist di fine servizio (rientro), rifornimento e completamento giro."""
    shift = await db.shifts.find_one({"id": sid})
    if not shift:
        raise HTTPException(status_code=404, detail="Turno non trovato")

    if user.get("role") == "driver" and user.get("driver_id") != shift.get("driver_id"):
        raise HTTPException(status_code=403, detail="Non sei l'autista assegnato a questo turno")

    now_iso = datetime.now(timezone.utc).isoformat()
    start_check = shift.get("start_checklist") or {}
    km_start = start_check.get("km_start")
    km_percorsi = None
    if km_start is not None and data.km_end is not None and data.km_end >= km_start:
        km_percorsi = data.km_end - km_start

    end_data = {
        "submitted_at": now_iso,
        "submitted_by_user": user.get("name") or user.get("email"),
        "km_end": data.km_end,
        "km_percorsi": km_percorsi,
        "fuel_done": data.fuel_done,
        "fuel_notes": data.fuel_notes or "",
        "service_completed": data.service_completed,
        "service_notes": data.service_notes or "",
        "items": [item.dict() for item in data.items],
        "notes": data.notes or "",
        "has_anomalies": any(item.status == "NC" for item in data.items) or not data.fuel_done or not data.service_completed
    }

    await db.shifts.update_one(
        {"id": sid},
        {"$set": {"end_checklist": end_data}}
    )

    # Aggiornamento in tempo reale del contachilometri del mezzo assegnato a fine servizio
    vehicle_id = shift.get("vehicle_id")
    if vehicle_id and data.km_end is not None and data.km_end > 0:
        v_update = {
            "last_km_updated_at": now_iso,
            "last_km_updated_by": user.get("name") or user.get("email") or "Autista"
        }
        veh = await db.vehicles.find_one({"id": vehicle_id})
        if veh:
            prev_km = veh.get("current_km") or 0
            if data.km_end >= prev_km:
                v_update["current_km"] = data.km_end
            await db.vehicles.update_one({"id": vehicle_id}, {"$set": v_update})

    # Se ci sono anomalie a fine servizio, avvisa lo staff
    issues = []
    if not data.fuel_done:
        issues.append("Rifornimento non effettuato")
    if not data.service_completed:
        issues.append("Giro incompleto")
    nc_items = [i for i in data.items if i.status == "NC"]
    if nc_items:
        issues.append(f"{len(nc_items)} NC mezzo")

    if issues:
        driver_name = user.get("name") or "Autista"
        await notify_admins(
            message=f"⚠️ {driver_name} ha chiuso il turno con note: {'; '.join(issues)}",
            kind="shift_report_issue",
            shift_id=sid
        )

    updated = await db.shifts.find_one({"id": sid}, {"_id": 0})
    return updated


@api_router.get("/shifts/checklist-archive")
async def get_checklist_archive(
    week_start: Optional[str] = None,
    driver_id: Optional[str] = None,
    only_anomalies: bool = False,
    user: dict = Depends(require_staff)
):
    """Restituisce l'archivio dei turni con checklist avviate o concluse per la consultazione dello staff."""
    query = {
        "$or": [
            {"start_checklist": {"$exists": True, "$ne": None}},
            {"end_checklist": {"$exists": True, "$ne": None}}
        ]
    }
    if week_start:
        query["week_start"] = week_start
    if driver_id:
        query["driver_id"] = driver_id
    if only_anomalies:
        query["$or"] = [
            {"start_checklist.has_anomalies": True},
            {"end_checklist.has_anomalies": True}
        ]

    shifts = await db.shifts.find(query, {"_id": 0}).sort("week_start", -1).to_list(300)
    return shifts


# ---------------------------------------------------------------------------
# Gestione Pesi & Scarichi (Weighings / Discharges)
# ---------------------------------------------------------------------------
def _calc_duration_minutes(entry_str: Optional[str], exit_str: Optional[str]) -> Optional[int]:
    if not entry_str or not exit_str:
        return None
    try:
        e_h, e_m = map(int, entry_str.strip().split(":"))
        x_h, x_m = map(int, exit_str.strip().split(":"))
        diff = (x_h * 60 + x_m) - (e_h * 60 + e_m)
        if diff < 0:
            diff += 24 * 60
        return diff
    except Exception:
        return None


def _calc_shift_date(week_start: Optional[str], day: Optional[int]) -> str:
    if not week_start:
        return datetime.now(timezone.utc).strftime("%Y-%m-%d")
    try:
        from datetime import datetime as dt_cls, timedelta
        d = 0 if day is None else int(day)
        return (dt_cls.strptime(week_start, "%Y-%m-%d") + timedelta(days=d)).strftime("%Y-%m-%d")
    except Exception:
        return week_start


@api_router.get("/shifts/{sid}/weighings")
async def list_shift_weighings(sid: str, user: dict = Depends(get_current_user)):
    """Restituisce tutti gli scarichi registrati per il turno specificato."""
    shift = await db.shifts.find_one({"id": sid})
    if not shift:
        raise HTTPException(status_code=404, detail="Turno non trovato")
    weighings = await db.weighings.find({"shift_id": sid}, {"_id": 0}).sort("discharge_number", 1).to_list(100)
    return weighings


@api_router.post("/shifts/{sid}/weighings")
async def create_shift_weighing(sid: str, data: WeighingInput, user: dict = Depends(get_current_user)):
    """Registra una nuova pesata/scarico per il turno specificato."""
    shift = await db.shifts.find_one({"id": sid})
    if not shift:
        raise HTTPException(status_code=404, detail="Turno non trovato")

    if user.get("role") == "driver" and user.get("driver_id") != shift.get("driver_id"):
        raise HTTPException(status_code=403, detail="Non sei l'autista assegnato a questo turno")

    driver_id = shift.get("driver_id") or user.get("driver_id")
    driver = await db.drivers.find_one({"id": driver_id}) if driver_id else None
    driver_name = driver["name"] if driver else (user.get("name") or "Autista")

    vehicle_id = shift.get("vehicle_id")
    vehicle = await db.vehicles.find_one({"id": vehicle_id}) if vehicle_id else None
    vehicle_plate = vehicle.get("plate", "") if vehicle else ""
    vehicle_name = vehicle.get("name", "") if vehicle else ""

    route_id = shift.get("route_id")
    route = await db.routes.find_one({"id": route_id}) if route_id else None
    route_code = route.get("code", "") if route else ""
    route_name = route.get("name", "") if route else ""

    existing_count = await db.weighings.count_documents({"shift_id": sid})
    discharge_number = existing_count + 1

    duration = data.duration_minutes
    if duration is None:
        duration = _calc_duration_minutes(data.entry_time, data.exit_time)

    now_iso = datetime.now(timezone.utc).isoformat()
    shift_date = _calc_shift_date(shift.get("week_start"), shift.get("day"))

    weighing_doc = {
        "id": str(uuid.uuid4()),
        "shift_id": sid,
        "discharge_number": discharge_number,
        "date": shift_date,
        "week_start": shift.get("week_start"),
        "day": shift.get("day"),
        "slot": shift.get("slot"),
        "driver_id": driver_id,
        "driver_name": driver_name,
        "vehicle_id": vehicle_id,
        "vehicle_plate": vehicle_plate,
        "vehicle_name": vehicle_name,
        "route_id": route_id,
        "route_code": route_code,
        "route_name": route_name,
        "net_weight": float(data.net_weight),
        "destination": ((data.destination or "").strip() or "Akron"),
        "waste_type": data.waste_type.strip(),
        "entry_time": (data.entry_time or "").strip(),
        "exit_time": (data.exit_time or "").strip(),
        "duration_minutes": duration,
        "notes": (data.notes or "").strip(),
        "created_at": now_iso,
        "created_by": user.get("name") or user.get("email") or "Autista",
    }

    await db.weighings.insert_one(weighing_doc)

    shift_weighings = await db.weighings.find({"shift_id": sid}, {"_id": 0}).sort("discharge_number", 1).to_list(100)
    total_net_kg = sum(w.get("net_weight", 0) for w in shift_weighings)
    await db.shifts.update_one(
        {"id": sid},
        {"$set": {
            "weighings": shift_weighings,
            "weighings_count": len(shift_weighings),
            "total_net_weight_kg": total_net_kg,
        }}
    )

    clean_doc = {k: v for k, v in weighing_doc.items() if k != "_id"}
    return clean_doc


@api_router.patch("/weighings/{wid}")
async def update_weighing(wid: str, data: WeighingUpdateInput, user: dict = Depends(get_current_user)):
    """Aggiorna un record di pesata/scarico."""
    weighing = await db.weighings.find_one({"id": wid})
    if not weighing:
        raise HTTPException(status_code=404, detail="Scarico non trovato")

    if user.get("role") == "driver" and user.get("driver_id") != weighing.get("driver_id"):
        raise HTTPException(status_code=403, detail="Non autorizzato a modificare questo scarico")

    updates = {}
    if data.net_weight is not None:
        updates["net_weight"] = float(data.net_weight)
    if data.destination is not None:
        updates["destination"] = data.destination.strip()
    if data.waste_type is not None:
        updates["waste_type"] = data.waste_type.strip()
    if data.entry_time is not None:
        updates["entry_time"] = data.entry_time.strip()
    if data.exit_time is not None:
        updates["exit_time"] = data.exit_time.strip()
    if data.notes is not None:
        updates["notes"] = data.notes.strip()

    entry_val = updates.get("entry_time", weighing.get("entry_time", ""))
    exit_val = updates.get("exit_time", weighing.get("exit_time", ""))
    if data.duration_minutes is not None:
        updates["duration_minutes"] = data.duration_minutes
    elif data.entry_time is not None or data.exit_time is not None:
        updates["duration_minutes"] = _calc_duration_minutes(entry_val, exit_val)

    updates["updated_at"] = datetime.now(timezone.utc).isoformat()

    await db.weighings.update_one({"id": wid}, {"$set": updates})

    sid = weighing.get("shift_id")
    if sid:
        shift_weighings = await db.weighings.find({"shift_id": sid}, {"_id": 0}).sort("discharge_number", 1).to_list(100)
        total_net_kg = sum(w.get("net_weight", 0) for w in shift_weighings)
        await db.shifts.update_one(
            {"id": sid},
            {"$set": {
                "weighings": shift_weighings,
                "weighings_count": len(shift_weighings),
                "total_net_weight_kg": total_net_kg,
            }}
        )

    return await db.weighings.find_one({"id": wid}, {"_id": 0})


@api_router.delete("/weighings/{wid}")
async def delete_weighing(wid: str, user: dict = Depends(get_current_user)):
    """Elimina un record di pesata/scarico."""
    weighing = await db.weighings.find_one({"id": wid})
    if not weighing:
        raise HTTPException(status_code=404, detail="Scarico non trovato")

    if user.get("role") == "driver" and user.get("driver_id") != weighing.get("driver_id"):
        raise HTTPException(status_code=403, detail="Non autorizzato a eliminare questo scarico")

    sid = weighing.get("shift_id")
    await db.weighings.delete_one({"id": wid})

    if sid:
        shift_weighings = await db.weighings.find({"shift_id": sid}, {"_id": 0}).sort("discharge_number", 1).to_list(100)
        for idx, w in enumerate(shift_weighings, start=1):
            if w.get("discharge_number") != idx:
                await db.weighings.update_one({"id": w["id"]}, {"$set": {"discharge_number": idx}})
                w["discharge_number"] = idx

        total_net_kg = sum(w.get("net_weight", 0) for w in shift_weighings)
        await db.shifts.update_one(
            {"id": sid},
            {"$set": {
                "weighings": shift_weighings,
                "weighings_count": len(shift_weighings),
                "total_net_weight_kg": total_net_kg,
            }}
        )

    return {"ok": True, "deleted": wid}


@api_router.get("/weighings")
async def get_weighings_archive(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    driver_id: Optional[str] = None,
    vehicle_id: Optional[str] = None,
    destination: Optional[str] = None,
    waste_type: Optional[str] = None,
    user: dict = Depends(require_staff)
):
    """Restituisce l'archivio completo delle pesate con filtri avanzati per la consultazione dello staff."""
    query = {}
    if start_date and end_date:
        query["date"] = {"$gte": start_date, "$lte": end_date}
    elif start_date:
        query["date"] = {"$gte": start_date}
    elif end_date:
        query["date"] = {"$lte": end_date}

    if driver_id:
        query["driver_id"] = driver_id
    if vehicle_id:
        query["vehicle_id"] = vehicle_id
    if destination:
        query["destination"] = {"$regex": destination, "$options": "i"}
    if waste_type:
        query["waste_type"] = {"$regex": waste_type, "$options": "i"}

    weighings = await db.weighings.find(query, {"_id": 0}).sort([("date", -1), ("created_at", -1)]).to_list(1000)
    return weighings


@api_router.get("/meta/slots")
async def meta_slots(user: dict = Depends(get_current_user)):
    return {"slots": SHIFT_SLOTS, "days": DAYS}


# ---------------------------------------------------------------------------
# Gestione Notifiche (autisti e staff)
# ---------------------------------------------------------------------------
@api_router.get("/notifications")
async def list_notifications(user: dict = Depends(get_current_user)):
    if user.get("role") in ("admin", "assistant"):
        uid = user.get("id")
        # Gli utenti staff visualizzano notifiche personali e notifiche generali rivolte allo staff (anche se aggiunti in seguito)
        notifs = await db.notifications.find(
            {"$or": [
                {"user_id": uid},
                {"target_role": {"$in": ["staff", "admin", "assistant"]}},
                {"target_roles": {"$in": ["staff", "admin", "assistant"]}}
            ]},
            {"_id": 0}
        ).sort("created_at", -1).to_list(100)
        for n in notifs:
            if "read_by" in n and isinstance(n["read_by"], list):
                n["read"] = uid in n["read_by"]
        return notifs
    did = user.get("driver_id")
    if not did:
        return []
    return await db.notifications.find({"driver_id": did}, {"_id": 0}).sort("created_at", -1).to_list(100)


@api_router.post("/notifications/read")
async def mark_notifications_read(data: NotifRead, user: dict = Depends(get_current_user)):
    if user.get("role") in ("admin", "assistant"):
        uid = user.get("id")
        q_user = {"user_id": uid}
        q_staff = {"target_role": {"$in": ["staff", "admin", "assistant"]}}
        if data.ids:
            q_user["id"] = {"$in": data.ids}
            q_staff["id"] = {"$in": data.ids}
        await db.notifications.update_many(q_user, {"$set": {"read": True}})
        await db.notifications.update_many(q_staff, {"$addToSet": {"read_by": uid}})
        return {"ok": True}
    did = user.get("driver_id")
    if not did:
        return {"ok": True}
    q = {"driver_id": did}
    if data.ids:
        q["id"] = {"$in": data.ids}
    await db.notifications.update_many(q, {"$set": {"read": True}})
    return {"ok": True}
    did = user.get("driver_id")
    if not did:
        return {"ok": True}
    q = {"driver_id": did}
    if data.ids:
        q["id"] = {"$in": data.ids}
    await db.notifications.update_many(q, {"$set": {"read": True}})
    return {"ok": True}


# ---------------------------------------------------------------------------
# Richieste di scambio turno (richiesta autista, approvazione staff)
# ---------------------------------------------------------------------------
async def _enrich_swap(sw: dict) -> dict:
    frm = await db.drivers.find_one({"id": sw["from_driver_id"]}, {"_id": 0})
    to = await db.drivers.find_one({"id": sw["to_driver_id"]}, {"_id": 0})
    shift = None
    shift_label = "Turno non disponibile"
    if sw.get("kind") == "week":
        wk = sw.get("week_start", "")
        shift_label = f"Settimana del {wk} (Tutti i turni)"
    elif sw.get("shift_id"):
        shift = await db.shifts.find_one({"id": sw["shift_id"]}, {"_id": 0})
        shift_label = await _shift_label(shift) if shift else "Turno non disponibile"
    return {
        **sw,
        "from_name": frm["name"] if frm else (sw.get("from_name") or "Autista"),
        "to_name": to["name"] if to else (sw.get("to_name") or "Autista"),
        "shift_label": shift_label,
        "shift": shift,
    }


@api_router.get("/swap-requests")
async def list_swaps(user: dict = Depends(get_current_user)):
    if user.get("role") == "admin":
        rows = await db.swap_requests.find({}, {"_id": 0}).sort("created_at", -1).to_list(500)
    else:
        did = user.get("driver_id")
        rows = await db.swap_requests.find(
            {"$or": [{"from_driver_id": did}, {"to_driver_id": did}]}, {"_id": 0}
        ).sort("created_at", -1).to_list(500)
    return [await _enrich_swap(r) for r in rows]


@api_router.post("/swap-requests")
async def create_swap(data: SwapRequestInput, user: dict = Depends(get_current_user)):
    did = user.get("driver_id")
    if not did:
        raise HTTPException(status_code=403, detail="Solo gli autisti possono richiedere un cambio")
    if data.to_driver_id == did:
        raise HTTPException(status_code=400, detail="Seleziona un collega diverso")

    from_driver = await db.drivers.find_one({"id": did}, {"_id": 0})
    to_driver = await db.drivers.find_one({"id": data.to_driver_id}, {"_id": 0})
    if not to_driver or not to_driver.get("active", True):
        raise HTTPException(status_code=400, detail="Il collega selezionato non è valido o non è attivo")

    from_name = from_driver["name"] if from_driver else "Un collega"
    to_name = to_driver["name"] if to_driver else "un collega"

    # Controllo gruppo: se il richiedente appartiene a un gruppo, può richiedere solo a chi è in un gruppo diverso
    from_grp = (from_driver or {}).get("group")
    to_grp = (to_driver or {}).get("group")
    if from_grp and to_grp == from_grp:
        raise HTTPException(status_code=400, detail="Puoi richiedere lo scambio solo a colleghi appartenenti a un gruppo diverso")

    if data.kind == "week":
        if not data.week_start:
            raise HTTPException(status_code=400, detail="Specifica la settimana da scambiare")
        user_shifts = await db.shifts.find({"week_start": data.week_start, "driver_id": did}, {"_id": 0}).to_list(100)
        if not user_shifts:
            raise HTTPException(status_code=400, detail="Non hai turni assegnati in questa settimana da scambiare")
        label = f"Settimana del {data.week_start} (TUTTI I TURNI)"
        sw = {
            "id": str(uuid.uuid4()),
            "kind": "week",
            "week_start": data.week_start,
            "shift_id": None,
            "from_driver_id": did,
            "to_driver_id": data.to_driver_id,
            "note": data.note,
            "status": "pending_driver",
            "driver_approved": None,
            "admin_approved": None,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
    else:
        if not data.shift_id:
            raise HTTPException(status_code=400, detail="Specifica il turno da scambiare")
        shift = await db.shifts.find_one({"id": data.shift_id}, {"_id": 0})
        if not shift:
            raise HTTPException(status_code=404, detail="Turno non trovato")
        if shift.get("driver_id") != did:
            raise HTTPException(status_code=400, detail="Puoi richiedere il cambio solo dei tuoi turni")

        # Verifica abilitazione al giro e al mezzo del turno
        route = await db.routes.find_one({"id": shift.get("route_id")}, {"_id": 0})
        to_route_skills = to_driver.get("route_skills") or []
        if shift.get("route_id") and shift.get("route_id") not in to_route_skills:
            raise HTTPException(
                status_code=400,
                detail=f"Il collega {to_name} non ha l'abilitazione per il giro {route.get('code', '') if route else ''}"
            )

        veh_id = shift.get("vehicle_id") or (route or {}).get("vehicle_id")
        to_veh_skills = to_driver.get("vehicle_skills") or []
        if veh_id and veh_id not in to_veh_skills:
            if (route or {}).get("vehicle_assignment_mode") == "auto" and not shift.get("vehicle_id") and len(to_veh_skills) > 0:
                pass
            else:
                raise HTTPException(
                    status_code=400,
                    detail=f"Il collega {to_name} non ha l'abilitazione per il mezzo previsto per questo turno"
                )

        label = await _shift_label(shift)
        sw = {
            "id": str(uuid.uuid4()),
            "kind": "shift",
            "shift_id": data.shift_id,
            "week_start": shift.get("week_start"),
            "from_driver_id": did,
            "to_driver_id": data.to_driver_id,
            "note": data.note,
            "status": "pending_driver",
            "driver_approved": None,
            "admin_approved": None,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }

    await db.swap_requests.insert_one(dict(sw))
    sw.pop("_id", None)

    # Invia notifica all'autista destinatario e agli amministratori
    await notify(data.to_driver_id, f"{from_name} ti propone uno scambio turno: {label}. Apri l'app per rispondere.", "swap", sw.get("shift_id"))
    await notify_admins(f"Nuova richiesta cambio ({from_name} → {to_name}): {label}. In attesa della risposta del collega.", "swap", sw.get("shift_id"))
    return sw


@api_router.patch("/swap-requests/{swid}/driver-respond")
async def driver_respond_swap(swid: str, data: DriverSwapResponse, user: dict = Depends(get_current_user)):
    """L'autista destinatario (autista B) accetta o rifiuta la richiesta di cambio turno."""
    did = user.get("driver_id")
    if not did:
        raise HTTPException(status_code=403, detail="Solo gli autisti possono rispondere")
    sw = await db.swap_requests.find_one({"id": swid}, {"_id": 0})
    if not sw:
        raise HTTPException(status_code=404, detail="Richiesta non trovata")
    if sw["to_driver_id"] != did:
        raise HTTPException(status_code=403, detail="Non sei il destinatario di questa richiesta")
    if sw["status"] not in ("pending_driver",):
        raise HTTPException(status_code=400, detail="Questa richiesta non è più in attesa della tua risposta")

    if sw.get("kind") == "week":
        label = f"l'intera settimana del {sw.get('week_start')}"
    else:
        shift = await db.shifts.find_one({"id": sw["shift_id"]}, {"_id": 0})
        label = await _shift_label(shift) if shift else "turno"

    to_driver = await db.drivers.find_one({"id": did}, {"_id": 0})
    to_name = to_driver["name"] if to_driver else "Il collega"

    if data.accepted:
        await db.swap_requests.update_one({"id": swid}, {"$set": {
            "status": "pending_admin",
            "driver_approved": True,
            "driver_response_note": data.note,
            "driver_responded_at": datetime.now(timezone.utc).isoformat(),
        }})
        await notify(sw["from_driver_id"], f"{to_name} ha ACCETTATO lo scambio per {label}. In attesa dell'approvazione dell'admin.", "swap", sw.get("shift_id"))
        await notify_admins(f"{to_name} ha accettato lo scambio per {label}. La tua approvazione è ora richiesta.", "swap", sw.get("shift_id"))
    else:
        await db.swap_requests.update_one({"id": swid}, {"$set": {
            "status": "rejected",
            "driver_approved": False,
            "driver_response_note": data.note,
            "driver_responded_at": datetime.now(timezone.utc).isoformat(),
        }})
        await notify(sw["from_driver_id"], f"{to_name} ha RIFIUTATO lo scambio per {label}.", "swap", sw.get("shift_id"))
        await notify_admins(f"{to_name} ha rifiutato lo scambio per {label}. Nessuna azione richiesta.", "swap", sw.get("shift_id"))

    return await db.swap_requests.find_one({"id": swid}, {"_id": 0})


@api_router.patch("/swap-requests/{swid}")
async def decide_swap(swid: str, data: SwapDecision, user: dict = Depends(require_staff)):
    sw = await db.swap_requests.find_one({"id": swid}, {"_id": 0})
    if not sw:
        raise HTTPException(status_code=404, detail="Richiesta non trovata")
    if data.status not in ("approved", "rejected"):
        raise HTTPException(status_code=400, detail="Stato non valido")
    if sw.get("driver_approved") is not True and data.status == "approved":
        raise HTTPException(status_code=400, detail="Il collega non ha ancora accettato. Attendi la sua risposta prima di approvare.")

    user_name = user.get("name") or user.get("email")
    user_role = user.get("role")
    now_iso = datetime.now(timezone.utc).isoformat()

    await db.swap_requests.update_one({"id": swid}, {"$set": {
        "status": data.status,
        "admin_approved": data.status == "approved",
        "decided_at": now_iso,
        "decided_by": user_name,
        "decided_by_role": user_role,
    }})

    is_week = sw.get("kind") == "week"
    role_label = "Assistente" if user_role == "assistant" else "Admin"
    if is_week:
        wk = sw.get("week_start")
        label = f"l'intera settimana del {wk}"
        if data.status == "approved":
            from_did = sw["from_driver_id"]
            to_did = sw["to_driver_id"]
            
            # Segnaposto temporaneo
            temp_tag = f"__swap_temp_{uuid.uuid4()}__"
            await db.shifts.update_many({"week_start": wk, "driver_id": from_did}, {"$set": {"driver_id": temp_tag}})
            await db.shifts.update_many({"week_start": wk, "driver_id": to_did}, {"$set": {"driver_id": from_did}})
            await db.shifts.update_many({"week_start": wk, "driver_id": temp_tag}, {"$set": {"driver_id": to_did}})
            
            # Registrazione nello storico delle modifiche per tutti i turni della settimana
            audit_msg = f"Scambio settimanale approvato da {user_name} ({role_label})"
            await db.shifts.update_many(
                {"week_start": wk, "driver_id": {"$in": [from_did, to_did]}},
                {
                    "$set": {
                        "last_modified_by": user_name,
                        "last_modified_role": user_role,
                        "last_modified_at": now_iso
                    },
                    "$push": {
                        "history": {
                            "action": "swap_approved",
                            "by": user_name,
                            "role": user_role,
                            "at": now_iso,
                            "detail": audit_msg
                        }
                    }
                }
            )
            
            await notify(from_did, f"✅ Scambio settimanale APPROVATO ({role_label}) per la settimana del {wk}.", "swap")
            await notify(to_did, f"✅ Scambio settimanale APPROVATO ({role_label}) per la settimana del {wk}.", "swap")
        else:
            await notify(sw["from_driver_id"], f"❌ Scambio settimanale RIFIUTATO ({role_label}) per {label}.", "swap")
            await notify(sw["to_driver_id"], f"❌ Scambio settimanale RIFIUTATO ({role_label}): turni invariati.", "swap")
    else:
        shift = await db.shifts.find_one({"id": sw["shift_id"]}, {"_id": 0})
        label = await _shift_label(shift) if shift else "turno"
        if data.status == "approved" and shift:
            audit_msg = f"Scambio turno singolo approvato da {user_name} ({role_label})"
            await db.shifts.update_one(
                {"id": sw["shift_id"]},
                {
                    "$set": {
                        "driver_id": sw["to_driver_id"],
                        "status": "assigned",
                        "last_modified_by": user_name,
                        "last_modified_role": user_role,
                        "last_modified_at": now_iso
                    },
                    "$push": {
                        "history": {
                            "action": "swap_approved",
                            "by": user_name,
                            "role": user_role,
                            "at": now_iso,
                            "detail": audit_msg
                        }
                    }
                }
            )
            await notify(sw["from_driver_id"], f"✅ Cambio APPROVATO ({role_label}): {label} è ora del tuo collega.", "swap", sw["shift_id"])
            await notify(sw["to_driver_id"], f"✅ Cambio APPROVATO ({role_label}): ti è stato assegnato il turno {label}.", "swap", sw["shift_id"])
        else:
            await notify(sw["from_driver_id"], f"❌ Cambio RIFIUTATO ({role_label}) per {label}.", "swap", sw["shift_id"])
            await notify(sw["to_driver_id"], f"❌ Cambio RIFIUTATO ({role_label}): il turno {label} rimane invariato.", "swap", sw["shift_id"])
    return await db.swap_requests.find_one({"id": swid}, {"_id": 0})


@api_router.delete("/swap-requests/{swid}")
async def delete_swap(swid: str, user: dict = Depends(require_admin)):
    sw = await db.swap_requests.find_one({"id": swid})
    if not sw:
        raise HTTPException(status_code=404, detail="Richiesta di cambio non trovata")
    await db.swap_requests.delete_one({"id": swid})
    return {"ok": True, "deleted": swid}


# ---------------------------------------------------------------------------
# Inizializzazione dati e popolamento iniziale
# ---------------------------------------------------------------------------
DEMO_DRIVER_EMAILS = [
    "mario.rossi@hera.it", "luca.bianchi@hera.it", "giulia.verdi@hera.it",
    "antonio.russo@hera.it", "sara.ferrari@hera.it", "marco.esposito@hera.it",
    "elena.romano@hera.it", "davide.colombo@hera.it",
]
DEMO_PLATES = ["DL 123 AB", "EF 456 CD", "GH 789 EF", "IL 012 GH", "MN 345 IK"]
DEMO_ROUTE_CODES = [
    "CS-IND", "ZI-CAR", "QN-ORG", "LM-PLA", "PS-IND", "MC-VET", "ZO-ORG",
    "SP-CEN", "RC-ING", "CB-NRD", "DOM-CEN", "DOM-MER", "DOM-LUN", "IS-ECO",
]


async def seed_admin():
    admin_email = os.environ.get("ADMIN_EMAIL", "admin@hera.it").lower()
    admin_password = os.environ.get("ADMIN_PASSWORD", "admin123")
    existing = await db.users.find_one({"email": admin_email})
    if not existing:
        await db.users.insert_one({
            "id": str(uuid.uuid4()), "email": admin_email,
            "password_hash": hash_password(admin_password),
            "name": "Amministratore", "role": "admin",
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
    elif not verify_password(admin_password, existing["password_hash"]):
        await db.users.update_one({"email": admin_email}, {"$set": {"password_hash": hash_password(admin_password)}})


async def remove_demo_data():
    """One-time cleanup of the pre-loaded demo dataset (runs once, guarded by app_meta flag)."""
    meta = await db.app_meta.find_one({"key": "demo"})
    if meta and meta.get("removed"):
        return
    await db.drivers.delete_many({"email": {"$in": DEMO_DRIVER_EMAILS}})
    await db.users.delete_many({"role": "driver", "email": {"$in": DEMO_DRIVER_EMAILS}})
    await db.vehicles.delete_many({"plate": {"$in": DEMO_PLATES}})
    await db.routes.delete_many({"code": {"$in": DEMO_ROUTE_CODES}})
    await db.shifts.delete_many({})
    await db.absences.delete_many({})
    await db.app_meta.update_one({"key": "demo"}, {"$set": {"key": "demo", "removed": True}}, upsert=True)


@api_router.get("/health")
async def health_check():
    db_ok = False
    try:
        await client.admin.command('ping')
        db_ok = True
    except Exception as e:
        logger.error(f"Database ping failed: {e}")
    return {
        "status": "ok",
        "database_connected": db_ok,
        "version": "2.2.0",
        "features": {
            "medical_kit": True,
            "driver_swap": True,
            "groups_g1_g2": True,
            "assistants_rbac": True
        }
    }


@app.on_event("startup")
async def on_startup():
    logger.info("Starting Hera Gestionale Backend...")
    try:
        await db.users.create_index("email", unique=True)
        await seed_admin()
        await remove_demo_data()
        logger.info("Database initialized successfully.")
    except Exception as e:
        logger.error(f"Initial DB seed error (will retry on incoming requests): {e}")


app.include_router(api_router)
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()


