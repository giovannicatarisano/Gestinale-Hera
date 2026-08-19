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
    vehicle_skills: List[str] = []
    route_skills: List[str] = []


class DriverInput(BaseModel):
    name: str
    email: str = ""
    phone: str = ""
    active: bool = True
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
    shift_id: str
    to_driver_id: str
    note: str = ""


class SwapDecision(BaseModel):
    status: str  # "approved" | "rejected"


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


def week_index(week_start: str) -> int:
    monday = datetime.strptime(week_start, "%Y-%m-%d").date()
    return (monday - ROTATION_EPOCH).days // 7


def weekly_slot_map(week_start: str, drivers: list) -> dict:
    """Each active driver works ONE slot for the whole week; the slot rotates week by week."""
    wi = week_index(week_start)
    ordered = sorted(drivers, key=lambda d: d["id"])
    return {d["id"]: ROTATION_SLOTS[(idx + wi) % len(ROTATION_SLOTS)] for idx, d in enumerate(ordered)}


@api_router.get("/rotation")
async def get_rotation(week_start: str, user: dict = Depends(get_current_user)):
    drivers = [d for d in await db.drivers.find({}, {"_id": 0}).to_list(1000) if d.get("active", True)]
    smap = weekly_slot_map(week_start, drivers)
    return {
        "week_start": week_start,
        "week_index": week_index(week_start),
        "rotation": [{"driver_id": d["id"], "name": d["name"], "slot": smap.get(d["id"])} for d in drivers],
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
                    # weekly-slot rotation: domenica is extra (any driver), weekday slots are locked
                    if slot != "domenica" and wslot.get(did) != slot:
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
# Notifications (driver)
# ---------------------------------------------------------------------------
@api_router.get("/notifications")
async def list_notifications(user: dict = Depends(get_current_user)):
    did = user.get("driver_id")
    if not did:
        return []
    return await db.notifications.find({"driver_id": did}, {"_id": 0}).sort("created_at", -1).to_list(100)


@api_router.post("/notifications/read")
async def mark_notifications_read(data: NotifRead, user: dict = Depends(get_current_user)):
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
    shift = await db.shifts.find_one({"id": sw["shift_id"]}, {"_id": 0})
    return {
        **sw,
        "from_name": frm["name"] if frm else "—",
        "to_name": to["name"] if to else "—",
        "shift_label": await _shift_label(shift) if shift else "Turno non disponibile",
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
    shift = await db.shifts.find_one({"id": data.shift_id}, {"_id": 0})
    if not shift:
        raise HTTPException(status_code=404, detail="Turno non trovato")
    if shift.get("driver_id") != did:
        raise HTTPException(status_code=400, detail="Puoi richiedere il cambio solo dei tuoi turni")
    if data.to_driver_id == did:
        raise HTTPException(status_code=400, detail="Seleziona un collega diverso")
    sw = {
        "id": str(uuid.uuid4()),
        "shift_id": data.shift_id,
        "from_driver_id": did,
        "to_driver_id": data.to_driver_id,
        "note": data.note,
        "status": "pending",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.swap_requests.insert_one(dict(sw))
    sw.pop("_id", None)
    return sw


@api_router.patch("/swap-requests/{swid}")
async def decide_swap(swid: str, data: SwapDecision, user: dict = Depends(require_admin)):
    sw = await db.swap_requests.find_one({"id": swid}, {"_id": 0})
    if not sw:
        raise HTTPException(status_code=404, detail="Richiesta non trovata")
    if data.status not in ("approved", "rejected"):
        raise HTTPException(status_code=400, detail="Stato non valido")
    await db.swap_requests.update_one({"id": swid}, {"$set": {"status": data.status, "decided_at": datetime.now(timezone.utc).isoformat()}})

    shift = await db.shifts.find_one({"id": sw["shift_id"]}, {"_id": 0})
    label = await _shift_label(shift) if shift else "turno"
    if data.status == "approved" and shift:
        await db.shifts.update_one({"id": sw["shift_id"]}, {"$set": {"driver_id": sw["to_driver_id"], "status": "assigned"}})
        await notify(sw["from_driver_id"], f"Cambio APPROVATO: {label} passa a un collega", "swap", sw["shift_id"])
        await notify(sw["to_driver_id"], f"Cambio APPROVATO: ti è stato assegnato {label}", "swap", sw["shift_id"])
    else:
        await notify(sw["from_driver_id"], f"Cambio RIFIUTATO per {label}", "swap", sw["shift_id"])
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

