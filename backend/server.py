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
try:
    ca = certifi.where()
    client = AsyncIOMotorClient(mongo_url, tlsCAFile=ca, serverSelectionTimeoutMS=5000)
except Exception:
    client = AsyncIOMotorClient(mongo_url, serverSelectionTimeoutMS=5000)
db_name = os.environ.get('DB_NAME', 'hera_gestionale')
db = client[db_name]

app = FastAPI(title="Hera Turni API")
api_router = APIRouter(prefix="/api")

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("hera")

# ---------------------------------------------------------------------------
# Constants
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
# Auth helpers
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


# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------
class LoginInput(BaseModel):
    email: str
    password: str


class Vehicle(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    plate: str
    type: str = "Compattatore"


class VehicleInput(BaseModel):
    name: str
    plate: str
    type: str = "Compattatore"


class Route(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    code: str
    zone: str = ""
    vehicle_id: str
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
    vehicle_id: str
    slot: str
    schedule_mode: str = "fixed"
    days: List[int] = []
    interval_days: int = 2
    start_date: Optional[str] = None
    pinned: bool = False


class Driver(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    email: str = ""
    phone: str = ""
    active: bool = True
    group: str = ""   # "" | "gruppo1" | "gruppo2"
    vehicle_skills: List[str] = []
    route_skills: List[str] = []


class DriverInput(BaseModel):
    name: str
    email: str = ""
    phone: str = ""
    active: bool = True
    group: str = ""   # "" | "gruppo1" | "gruppo2"
    password: Optional[str] = None


class SkillsInput(BaseModel):
    vehicle_skills: List[str] = []
    route_skills: List[str] = []


class GenerateInput(BaseModel):
    week_start: str


class ShiftPatch(BaseModel):
    driver_id: Optional[str] = None
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
# Auth routes
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
# Vehicles
# ---------------------------------------------------------------------------
@api_router.get("/vehicles")
async def list_vehicles(user: dict = Depends(get_current_user)):
    return await db.vehicles.find({}, {"_id": 0}).to_list(1000)


@api_router.post("/vehicles")
async def create_vehicle(data: VehicleInput, user: dict = Depends(require_admin)):
    v = Vehicle(**data.model_dump())
    await db.vehicles.insert_one(v.model_dump())
    return v


@api_router.put("/vehicles/{vid}")
async def update_vehicle(vid: str, data: VehicleInput, user: dict = Depends(require_admin)):
    await db.vehicles.update_one({"id": vid}, {"$set": data.model_dump()})
    return await db.vehicles.find_one({"id": vid}, {"_id": 0})


@api_router.delete("/vehicles/{vid}")
async def delete_vehicle(vid: str, user: dict = Depends(require_admin)):
    await db.vehicles.delete_one({"id": vid})
    return {"ok": True}


# ---------------------------------------------------------------------------
# Routes (Giri)
# ---------------------------------------------------------------------------
@api_router.get("/routes")
async def list_routes(user: dict = Depends(get_current_user)):
    return await db.routes.find({}, {"_id": 0}).to_list(1000)


@api_router.post("/routes")
async def create_route(data: RouteInput, user: dict = Depends(require_admin)):
    r = Route(**data.model_dump())
    await db.routes.insert_one(r.model_dump())
    return r


@api_router.put("/routes/{rid}")
async def update_route(rid: str, data: RouteInput, user: dict = Depends(require_admin)):
    await db.routes.update_one({"id": rid}, {"$set": data.model_dump()})
    return await db.routes.find_one({"id": rid}, {"_id": 0})


@api_router.delete("/routes/{rid}")
async def delete_route(rid: str, user: dict = Depends(require_admin)):
    await db.routes.delete_one({"id": rid})
    return {"ok": True}


# ---------------------------------------------------------------------------
# Drivers
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
        raise HTTPException(status_code=400, detail="Email già utilizzata da un altro account")
    if existing:
        await db.users.update_one({"email": email}, {"$set": {"password_hash": hash_password(password), "name": driver["name"]}})
    else:
        await db.users.insert_one({
            "id": str(uuid.uuid4()), "email": email, "password_hash": hash_password(password),
            "name": driver["name"], "role": "driver", "driver_id": driver["id"],
            "created_at": datetime.now(timezone.utc).isoformat(),
        })


@api_router.post("/drivers")
async def create_driver(data: DriverInput, user: dict = Depends(require_admin)):
    payload = data.model_dump()
    password = payload.pop("password", None)
    d = Driver(**payload)
    await db.drivers.insert_one(d.model_dump())
    if password:
        await _create_driver_account(d.model_dump(), password)
    return d


@api_router.put("/drivers/{did}")
async def update_driver(did: str, data: DriverInput, user: dict = Depends(require_admin)):
    payload = data.model_dump()
    password = payload.pop("password", None)
    await db.drivers.update_one({"id": did}, {"$set": payload})
    driver = await db.drivers.find_one({"id": did}, {"_id": 0})
    if password:
        await _create_driver_account(driver, password)
    else:
        # keep linked account name/email in sync
        await db.users.update_one({"driver_id": did}, {"$set": {"name": driver["name"]}})
    return driver


@api_router.post("/drivers/{did}/credentials")
async def set_driver_credentials(did: str, data: CredentialsInput, user: dict = Depends(require_admin)):
    driver = await db.drivers.find_one({"id": did}, {"_id": 0})
    if not driver:
        raise HTTPException(status_code=404, detail="Autista non trovato")
    if len(data.password) < 4:
        raise HTTPException(status_code=400, detail="La password deve avere almeno 4 caratteri")
    await _create_driver_account(driver, data.password)
    return {"ok": True, "email": (driver.get("email") or "").strip().lower()}


@api_router.delete("/drivers/{did}")
async def delete_driver(did: str, user: dict = Depends(require_admin)):
    await db.drivers.delete_one({"id": did})
    await db.users.delete_many({"driver_id": did, "role": "driver"})
    return {"ok": True}


@api_router.put("/drivers/{did}/skills")
async def update_skills(did: str, data: SkillsInput, user: dict = Depends(require_admin)):
    await db.drivers.update_one({"id": did}, {"$set": data.model_dump()})
    return await db.drivers.find_one({"id": did}, {"_id": 0})


# ---------------------------------------------------------------------------
# Absences (ferie / malattia)
# ---------------------------------------------------------------------------
@api_router.get("/absences")
async def list_absences(user: dict = Depends(get_current_user)):
    return await db.absences.find({}, {"_id": 0}).to_list(2000)


@api_router.post("/absences")
async def create_absence(data: AbsenceInput, user: dict = Depends(require_admin)):
    if data.end_date < data.start_date:
        raise HTTPException(status_code=400, detail="La data di fine precede la data di inizio")
    a = Absence(**data.model_dump())
    await db.absences.insert_one(a.model_dump())
    return a


@api_router.put("/absences/{aid}")
async def update_absence(aid: str, data: AbsenceInput, user: dict = Depends(require_admin)):
    if data.end_date < data.start_date:
        raise HTTPException(status_code=400, detail="La data di fine precede la data di inizio")
    await db.absences.update_one({"id": aid}, {"$set": data.model_dump()})
    return await db.absences.find_one({"id": aid}, {"_id": 0})


@api_router.delete("/absences/{aid}")
async def delete_absence(aid: str, user: dict = Depends(require_admin)):
    await db.absences.delete_one({"id": aid})
    return {"ok": True}


def _absent_ids_on(absences: list, date_iso: str) -> set:
    return {a["driver_id"] for a in absences if a["start_date"] <= date_iso <= a["end_date"]}


# ---------------------------------------------------------------------------
# Shifts + Engine
# ---------------------------------------------------------------------------
@api_router.get("/shifts")
async def list_shifts(week_start: str, user: dict = Depends(get_current_user)):
    return await db.shifts.find({"week_start": week_start}, {"_id": 0}).to_list(5000)


async def _driver_can(driver: dict, route: dict) -> bool:
    return route["vehicle_id"] in driver.get("vehicle_skills", []) and route["id"] in driver.get("route_skills", [])


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
    """Broadcast a notification to all admin users via their user_id."""
    admins = await db.users.find({"role": "admin"}, {"_id": 0}).to_list(100)
    for admin in admins:
        await db.notifications.insert_one({
            "id": str(uuid.uuid4()),
            "user_id": admin["id"],
            "driver_id": None,
            "kind": kind,
            "message": message,
            "shift_id": shift_id,
            "read": False,
            "created_at": datetime.now(timezone.utc).isoformat(),
        })


async def _shift_label(shift: dict) -> str:
    route = await db.routes.find_one({"id": shift["route_id"]}, {"_id": 0})
    slot = SHIFT_SLOTS.get(shift["slot"], {}).get("label", shift["slot"])
    day = DAYS[shift["day"]] if 0 <= shift["day"] < len(DAYS) else ""
    return f"{route['name'] if route else 'Giro'} · {day} · {slot}"


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
ROTATION_EPOCH = date(2026, 1, 5)  # a Monday

# Slots considered "morning" (assigned to the morning group that week)
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
    - 'mattina' maps to 'standard' by default; 'presto' is also mattina.
    - Drivers without a group keep the old round-robin rotation.
    """
    wi = week_index(week_start)
    ungrouped = sorted([d for d in drivers if not d.get("group")], key=lambda d: d["id"])
    result = {}
    for d in drivers:
        grp = d.get("group", "")
        if grp:
            cat = group_slot_for_week(grp, week_start)
            # Map category to concrete slot (presto drivers are handled separately in generator)
            result[d["id"]] = "standard" if cat == "mattina" else "pomeriggio"
        else:
            # Legacy round-robin for ungrouped drivers
            idx = ungrouped.index(d)
            result[d["id"]] = ROTATION_SLOTS[(idx + wi) % len(ROTATION_SLOTS)]
    return result


@api_router.get("/rotation")
async def get_rotation(week_start: str, user: dict = Depends(get_current_user)):
    drivers = [d for d in await db.drivers.find({}, {"_id": 0}).to_list(1000) if d.get("active", True)]
    smap = weekly_slot_map(week_start, drivers)
    wi = week_index(week_start)
    # Determine which category each group gets this week
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
async def generate_shifts(data: GenerateInput, user: dict = Depends(require_admin)):
    week_start = data.week_start
    await db.shifts.delete_many({"week_start": week_start})

    routes = await db.routes.find({}, {"_id": 0}).to_list(1000)
    drivers = [d for d in await db.drivers.find({}, {"_id": 0}).to_list(1000) if d.get("active", True)]
    absences = await db.absences.find({}, {"_id": 0}).to_list(2000)
    monday = datetime.strptime(week_start, "%Y-%m-%d").date()

    # Weekly slot rotation: each driver is bound to one slot for the whole week.
    wslot = weekly_slot_map(week_start, drivers)

    week_load = {d["id"]: 0 for d in drivers}
    day_taken = {}            # (day, driver_id) -> True
    cap_count = {}            # (day, slot) -> int   (for capped slots)
    pom_days = {}             # driver_id -> set(days worked pomeriggio) for rest constraint
    shifts = []

    # Order: pomeriggio FIRST (so the rest-constraint before presto/domenica of next day is known),
    # then presto, standard, and domenica LAST. Pinned first within each phase.
    phase = {"pomeriggio": 0, "presto": 1, "standard": 2, "domenica": 3}

    def sort_key(r):
        return (phase.get(r["slot"], 9), not r.get("pinned", False))

    for route in sorted(routes, key=sort_key):
        slot = route["slot"]
        max_d = SHIFT_SLOTS.get(slot, {}).get("max_drivers")
        for day in route_days_for_week(route, week_start):
            date_iso = (monday + timedelta(days=day)).isoformat()
            absent = _absent_ids_on(absences, date_iso)
            assigned = None
            slot_full = max_d is not None and cap_count.get((day, slot), 0) >= max_d
            early = slot in ("presto", "domenica")
            if not slot_full:
                candidates = []
                for d in drivers:
                    did = d["id"]
                    if not await _driver_can(d, route):
                        continue
                    if day_taken.get((day, did)) or did in absent:
                        continue
                    # GROUP-BASED slot constraint
                    grp = d.get("group", "")
                    if slot != "domenica":
                        if grp:
                            # Grouped driver: must match their group's category this week
                            cat = group_slot_for_week(grp, week_start)  # "mattina" or "pomeriggio"
                            if slot == "pomeriggio" and cat != "pomeriggio":
                                continue  # pomeriggio route but driver is in mattina group
                            if slot in ("presto", "standard") and cat != "mattina":
                                continue  # mattina route but driver is in pomeriggio group
                        else:
                            # Ungrouped driver: old round-robin constraint
                            if wslot.get(did) != slot:
                                continue
                    # rest constraint: no early shift the day after a pomeriggio shift
                    if early and (day - 1) in pom_days.get(did, set()):
                        continue
                    candidates.append(d)
                candidates.sort(key=lambda d: week_load[d["id"]])
                if candidates:
                    assigned = candidates[0]

            shift = {
                "id": str(uuid.uuid4()),
                "week_start": week_start,
                "day": day,
                "slot": slot,
                "route_id": route["id"],
                "vehicle_id": route["vehicle_id"],
                "driver_id": assigned["id"] if assigned else None,
                "status": "assigned" if assigned else "uncovered",
                "pinned": route.get("pinned", False),
                "recovery": False,
            }
            shifts.append(shift)
            if assigned:
                week_load[assigned["id"]] += 1
                day_taken[(day, assigned["id"])] = True
                if slot == "pomeriggio":
                    pom_days.setdefault(assigned["id"], set()).add(day)
                if max_d is not None:
                    cap_count[(day, slot)] = cap_count.get((day, slot), 0) + 1

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
async def recover_shift(sid: str, user: dict = Depends(require_admin)):
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
    }
    await db.shifts.insert_one(new_shift)
    await db.shifts.update_one({"id": sid}, {"$set": {"status": "recovered"}})
    new_shift.pop("_id", None)
    if assigned:
        await notify(assigned["id"], f"Turno di recupero assegnato: {await _shift_label(new_shift)}", "shift", new_shift["id"])
    return new_shift


@api_router.get("/shifts/{sid}/substitutes")
async def substitutes(sid: str, user: dict = Depends(require_admin)):
    shift = await db.shifts.find_one({"id": sid}, {"_id": 0})
    if not shift:
        raise HTTPException(status_code=404, detail="Turno non trovato")
    route = await db.routes.find_one({"id": shift["route_id"]}, {"_id": 0})
    drivers = [d for d in await db.drivers.find({}, {"_id": 0}).to_list(1000) if d.get("active", True)]

    # who is busy this day
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
    # best first: qualified & available, then qualified, then rest; tie-break by load
    results.sort(key=lambda r: (not (r["qualified"] and r["available"]), not r["qualified"], r["week_load"]))
    return {"shift": shift, "route": route, "candidates": results}


@api_router.patch("/shifts/{sid}")
async def patch_shift(sid: str, data: ShiftPatch, user: dict = Depends(require_admin)):
    shift = await db.shifts.find_one({"id": sid}, {"_id": 0})
    if not shift:
        raise HTTPException(status_code=404, detail="Turno non trovato")
    prev_driver = shift.get("driver_id")
    update = {}
    new_driver = prev_driver
    if "driver_id" in data.model_fields_set:
        update["driver_id"] = data.driver_id
        update["status"] = "assigned" if data.driver_id else "uncovered"
        new_driver = data.driver_id
    if data.status is not None:
        update["status"] = data.status
        if data.status == "absence":
            update["driver_id"] = None
            new_driver = None
    await db.shifts.update_one({"id": sid}, {"$set": update})
    updated = await db.shifts.find_one({"id": sid}, {"_id": 0})

    # notifications on change
    if new_driver != prev_driver:
        label = await _shift_label(updated)
        if prev_driver:
            await notify(prev_driver, f"Sei stato rimosso dal turno: {label}", "shift", sid)
        if new_driver:
            await notify(new_driver, f"Ti è stato assegnato un nuovo turno: {label}", "shift", sid)
    return updated


@api_router.get("/meta/slots")
async def meta_slots(user: dict = Depends(get_current_user)):
    return {"slots": SHIFT_SLOTS, "days": DAYS}


# ---------------------------------------------------------------------------
# Notifications (driver + admin)
# ---------------------------------------------------------------------------
@api_router.get("/notifications")
async def list_notifications(user: dict = Depends(get_current_user)):
    if user.get("role") == "admin":
        # Admins see their own notifications (targeted by user_id)
        return await db.notifications.find(
            {"user_id": user["id"]}, {"_id": 0}
        ).sort("created_at", -1).to_list(100)
    did = user.get("driver_id")
    if not did:
        return []
    return await db.notifications.find({"driver_id": did}, {"_id": 0}).sort("created_at", -1).to_list(100)


@api_router.post("/notifications/read")
async def mark_notifications_read(data: NotifRead, user: dict = Depends(get_current_user)):
    if user.get("role") == "admin":
        q = {"user_id": user["id"]}
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
# Shift swap requests (driver requests, admin/assistant approves)
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
        "from_name": frm["name"] if frm else "—",
        "to_name": to["name"] if to else "—",
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
    from_name = from_driver["name"] if from_driver else "Un collega"
    to_name = to_driver["name"] if to_driver else "un collega"

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

    # Notify target driver & admin
    await notify(data.to_driver_id, f"{from_name} ti propone uno scambio turno: {label}. Apri l'app per rispondere.", "swap", sw.get("shift_id"))
    await notify_admins(f"Nuova richiesta cambio ({from_name} → {to_name}): {label}. In attesa della risposta del collega.", "swap", sw.get("shift_id"))
    return sw


@api_router.patch("/swap-requests/{swid}/driver-respond")
async def driver_respond_swap(swid: str, data: DriverSwapResponse, user: dict = Depends(get_current_user)):
    """Target driver (autista B) accepts or refuses the swap request."""
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
async def decide_swap(swid: str, data: SwapDecision, user: dict = Depends(require_admin)):
    sw = await db.swap_requests.find_one({"id": swid}, {"_id": 0})
    if not sw:
        raise HTTPException(status_code=404, detail="Richiesta non trovata")
    if data.status not in ("approved", "rejected"):
        raise HTTPException(status_code=400, detail="Stato non valido")
    if sw.get("driver_approved") is not True and data.status == "approved":
        raise HTTPException(status_code=400, detail="Il collega non ha ancora accettato. Attendi la sua risposta prima di approvare.")

    await db.swap_requests.update_one({"id": swid}, {"$set": {
        "status": data.status,
        "admin_approved": data.status == "approved",
        "decided_at": datetime.now(timezone.utc).isoformat()
    }})

    is_week = sw.get("kind") == "week"
    if is_week:
        wk = sw.get("week_start")
        label = f"l'intera settimana del {wk}"
        if data.status == "approved":
            # Swap all shifts in this week between from_driver and to_driver
            from_did = sw["from_driver_id"]
            to_did = sw["to_driver_id"]
            
            # Temporary placeholder tag
            temp_tag = f"__swap_temp_{uuid.uuid4()}__"
            await db.shifts.update_many({"week_start": wk, "driver_id": from_did}, {"$set": {"driver_id": temp_tag}})
            await db.shifts.update_many({"week_start": wk, "driver_id": to_did}, {"$set": {"driver_id": from_did}})
            await db.shifts.update_many({"week_start": wk, "driver_id": temp_tag}, {"$set": {"driver_id": to_did}})
            
            await notify(from_did, f"✅ Scambio settimanale APPROVATO dall'admin per la settimana del {wk}.", "swap")
            await notify(to_did, f"✅ Scambio settimanale APPROVATO dall'admin per la settimana del {wk}.", "swap")
        else:
            await notify(sw["from_driver_id"], f"❌ Scambio settimanale RIFIUTATO dall'admin per {label}.", "swap")
            await notify(sw["to_driver_id"], f"❌ Scambio settimanale RIFIUTATO dall'admin: turni invariati.", "swap")
    else:
        shift = await db.shifts.find_one({"id": sw["shift_id"]}, {"_id": 0})
        label = await _shift_label(shift) if shift else "turno"
        if data.status == "approved" and shift:
            await db.shifts.update_one({"id": sw["shift_id"]}, {"$set": {"driver_id": sw["to_driver_id"], "status": "assigned"}})
            await notify(sw["from_driver_id"], f"✅ Cambio APPROVATO dall'admin: {label} è ora del tuo collega.", "swap", sw["shift_id"])
            await notify(sw["to_driver_id"], f"✅ Cambio APPROVATO: ti è stato assegnato il turno {label}.", "swap", sw["shift_id"])
        else:
            await notify(sw["from_driver_id"], f"❌ Cambio RIFIUTATO dall'admin per {label}.", "swap", sw["shift_id"])
            await notify(sw["to_driver_id"], f"❌ Cambio RIFIUTATO dall'admin: il turno {label} rimane invariato.", "swap", sw["shift_id"])
    return await db.swap_requests.find_one({"id": swid}, {"_id": 0})


# ---------------------------------------------------------------------------
# Seeding (admin only) + one-time demo cleanup
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
    return {"status": "ok", "database_connected": db_ok}


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

