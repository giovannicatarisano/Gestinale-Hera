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
from datetime import datetime, timezone, timedelta

# ---------------------------------------------------------------------------
# DB
# ---------------------------------------------------------------------------
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

app = FastAPI(title="Hera Turni API")
api_router = APIRouter(prefix="/api")

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("hera")

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
JWT_ALGORITHM = "HS256"
JWT_SECRET = os.environ["JWT_SECRET"]

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


class SkillsInput(BaseModel):
    vehicle_skills: List[str] = []
    route_skills: List[str] = []


class GenerateInput(BaseModel):
    week_start: str


class ShiftPatch(BaseModel):
    driver_id: Optional[str] = None
    status: Optional[str] = None


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
    return await db.drivers.find({}, {"_id": 0}).to_list(1000)


@api_router.post("/drivers")
async def create_driver(data: DriverInput, user: dict = Depends(require_admin)):
    d = Driver(**data.model_dump())
    await db.drivers.insert_one(d.model_dump())
    return d


@api_router.put("/drivers/{did}")
async def update_driver(did: str, data: DriverInput, user: dict = Depends(require_admin)):
    await db.drivers.update_one({"id": did}, {"$set": data.model_dump()})
    return await db.drivers.find_one({"id": did}, {"_id": 0})


@api_router.delete("/drivers/{did}")
async def delete_driver(did: str, user: dict = Depends(require_admin)):
    await db.drivers.delete_one({"id": did})
    return {"ok": True}


@api_router.put("/drivers/{did}/skills")
async def update_skills(did: str, data: SkillsInput, user: dict = Depends(require_admin)):
    await db.drivers.update_one({"id": did}, {"$set": data.model_dump()})
    return await db.drivers.find_one({"id": did}, {"_id": 0})


# ---------------------------------------------------------------------------
# Shifts + Engine
# ---------------------------------------------------------------------------
@api_router.get("/shifts")
async def list_shifts(week_start: str, user: dict = Depends(get_current_user)):
    return await db.shifts.find({"week_start": week_start}, {"_id": 0}).to_list(5000)


async def _driver_can(driver: dict, route: dict) -> bool:
    return route["vehicle_id"] in driver.get("vehicle_skills", []) and route["id"] in driver.get("route_skills", [])


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


@api_router.post("/shifts/generate")
async def generate_shifts(data: GenerateInput, user: dict = Depends(require_admin)):
    week_start = data.week_start
    await db.shifts.delete_many({"week_start": week_start})

    routes = await db.routes.find({}, {"_id": 0}).to_list(1000)
    drivers = [d for d in await db.drivers.find({}, {"_id": 0}).to_list(1000) if d.get("active", True)]

    week_load = {d["id"]: 0 for d in drivers}
    day_taken = {}            # (day, driver_id) -> True
    cap_count = {}            # (day, slot) -> int   (for capped slots)
    shifts = []

    # pinned first, then tightest slots (capped) first
    slot_order = ["presto", "domenica", "standard", "pomeriggio"]

    def sort_key(r):
        s = slot_order.index(r["slot"]) if r["slot"] in slot_order else 9
        return (not r.get("pinned", False), s)

    for route in sorted(routes, key=sort_key):
        slot = route["slot"]
        max_d = SHIFT_SLOTS.get(slot, {}).get("max_drivers")
        for day in route_days_for_week(route, week_start):
            assigned = None
            slot_full = max_d is not None and cap_count.get((day, slot), 0) >= max_d
            if not slot_full:
                candidates = [
                    d for d in drivers
                    if await _driver_can(d, route) and not day_taken.get((day, d["id"]))
                ]
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
                if max_d is not None:
                    cap_count[(day, slot)] = cap_count.get((day, slot), 0) + 1

    if shifts:
        await db.shifts.insert_many(shifts)
    covered = len([s for s in shifts if s["driver_id"]])
    return {"total": len(shifts), "covered": covered, "uncovered": len(shifts) - covered}


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
    max_d = SHIFT_SLOTS.get(slot, {}).get("max_drivers")
    cap = len([s for s in day_shifts if s["slot"] == slot and s["driver_id"]])

    assigned = None
    if not (max_d is not None and cap >= max_d):
        cands = [d for d in drivers if route and await _driver_can(d, route) and d["id"] not in busy]
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

    results = []
    for d in drivers:
        if d["id"] == shift.get("driver_id"):
            continue
        qualified = await _driver_can(d, route) if route else False
        available = d["id"] not in busy
        results.append({
            "id": d["id"],
            "name": d["name"],
            "qualified": qualified,
            "available": available,
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
    update = {}
    if "driver_id" in data.model_fields_set:
        update["driver_id"] = data.driver_id
        update["status"] = "assigned" if data.driver_id else "uncovered"
    if data.status is not None:
        update["status"] = data.status
        if data.status == "absence":
            update["driver_id"] = None
    await db.shifts.update_one({"id": sid}, {"$set": update})
    return await db.shifts.find_one({"id": sid}, {"_id": 0})


@api_router.get("/meta/slots")
async def meta_slots(user: dict = Depends(get_current_user)):
    return {"slots": SHIFT_SLOTS, "days": DAYS}


# ---------------------------------------------------------------------------
# Seeding
# ---------------------------------------------------------------------------
async def seed():
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

    if await db.vehicles.count_documents({}) > 0:
        return  # demo data already present

    # Vehicles
    vehicles = [
        {"id": str(uuid.uuid4()), "name": "Compattatore Grande", "plate": "DL 123 AB", "type": "Compattatore 26t"},
        {"id": str(uuid.uuid4()), "name": "Compattatore Piccolo", "plate": "EF 456 CD", "type": "Compattatore 7t"},
        {"id": str(uuid.uuid4()), "name": "Vasca Scarrabile", "plate": "GH 789 EF", "type": "Scarrabile"},
        {"id": str(uuid.uuid4()), "name": "Spazzatrice Stradale", "plate": "IL 012 GH", "type": "Spazzatrice"},
        {"id": str(uuid.uuid4()), "name": "Autocarro Bilaterale", "plate": "MN 345 IK", "type": "Bilaterale"},
    ]
    await db.vehicles.insert_many([dict(v) for v in vehicles])
    vid = {v["name"]: v["id"] for v in vehicles}

    workdays = [0, 1, 2, 3, 4, 5]  # Lun-Sab
    routes = [
        {"id": str(uuid.uuid4()), "name": "Centro Storico - Indifferenziato", "code": "CS-IND", "zone": "Centro", "vehicle_id": vid["Compattatore Piccolo"], "slot": "presto", "days": workdays},
        {"id": str(uuid.uuid4()), "name": "Zona Industriale - Carta", "code": "ZI-CAR", "zone": "Industriale", "vehicle_id": vid["Compattatore Grande"], "slot": "presto", "days": [0, 1, 2, 3, 4]},
        {"id": str(uuid.uuid4()), "name": "Quartiere Nord - Organico", "code": "QN-ORG", "zone": "Nord", "vehicle_id": vid["Compattatore Piccolo"], "slot": "presto", "days": [0, 2, 4, 5]},
        {"id": str(uuid.uuid4()), "name": "Lungomare - Plastica", "code": "LM-PLA", "zone": "Mare", "vehicle_id": vid["Compattatore Grande"], "slot": "presto", "days": [1, 3, 5]},
        {"id": str(uuid.uuid4()), "name": "Periferia Sud - Indifferenziato", "code": "PS-IND", "zone": "Sud", "vehicle_id": vid["Compattatore Grande"], "slot": "standard", "days": workdays},
        {"id": str(uuid.uuid4()), "name": "Mercato Coperto - Vetro", "code": "MC-VET", "zone": "Centro", "vehicle_id": vid["Vasca Scarrabile"], "slot": "standard", "days": [0, 2, 4]},
        {"id": str(uuid.uuid4()), "name": "Zona Ospedaliera - Organico", "code": "ZO-ORG", "zone": "Est", "vehicle_id": vid["Compattatore Piccolo"], "slot": "standard", "days": workdays},
        {"id": str(uuid.uuid4()), "name": "Spazzamento Vie Centro", "code": "SP-CEN", "zone": "Centro", "vehicle_id": vid["Spazzatrice Stradale"], "slot": "pomeriggio", "days": workdays},
        {"id": str(uuid.uuid4()), "name": "Raccolta Ingombranti", "code": "RC-ING", "zone": "Città", "vehicle_id": vid["Autocarro Bilaterale"], "slot": "pomeriggio", "days": [1, 3]},
        {"id": str(uuid.uuid4()), "name": "Cassonetti Bilaterale Nord", "code": "CB-NRD", "zone": "Nord", "vehicle_id": vid["Autocarro Bilaterale"], "slot": "pomeriggio", "days": [0, 2, 4]},
    ]
    await db.routes.insert_many([dict(r) for r in routes])
    rid = {r["code"]: r["id"] for r in routes}

    all_v = list(vid.values())
    all_r = list(rid.values())
    drivers_spec = [
        ("Mario Rossi", "mario.rossi@hera.it", ["Compattatore Grande", "Compattatore Piccolo", "Spazzatrice Stradale"], ["CS-IND", "ZI-CAR", "SP-CEN", "PS-IND"]),
        ("Luca Bianchi", "luca.bianchi@hera.it", ["Compattatore Grande", "Vasca Scarrabile"], ["ZI-CAR", "LM-PLA", "MC-VET", "PS-IND"]),
        ("Giulia Verdi", "giulia.verdi@hera.it", ["Compattatore Piccolo", "Autocarro Bilaterale"], ["CS-IND", "QN-ORG", "ZO-ORG", "CB-NRD", "RC-ING"]),
        ("Antonio Russo", "antonio.russo@hera.it", ["Compattatore Grande", "Compattatore Piccolo", "Autocarro Bilaterale"], ["ZI-CAR", "PS-IND", "ZO-ORG", "RC-ING", "CB-NRD"]),
        ("Sara Ferrari", "sara.ferrari@hera.it", ["Compattatore Piccolo", "Spazzatrice Stradale"], ["CS-IND", "QN-ORG", "SP-CEN", "ZO-ORG"]),
        ("Marco Esposito", "marco.esposito@hera.it", ["Compattatore Grande", "Vasca Scarrabile", "Spazzatrice Stradale"], ["LM-PLA", "MC-VET", "SP-CEN", "PS-IND"]),
        ("Elena Romano", "elena.romano@hera.it", ["Compattatore Piccolo", "Autocarro Bilaterale"], ["QN-ORG", "ZO-ORG", "CB-NRD"]),
        ("Davide Colombo", "davide.colombo@hera.it", ["Compattatore Grande", "Compattatore Piccolo"], ["CS-IND", "ZI-CAR", "LM-PLA", "PS-IND", "ZO-ORG"]),
    ]
    drivers = []
    for name, email, vskills, rskills in drivers_spec:
        drivers.append({
            "id": str(uuid.uuid4()), "name": name, "email": email, "phone": "+39 051 000000",
            "active": True,
            "vehicle_skills": [vid[v] for v in vskills],
            "route_skills": [rid[r] for r in rskills],
        })
    await db.drivers.insert_many([dict(d) for d in drivers])

    # driver login for Mario Rossi
    mario = drivers[0]
    await db.users.insert_one({
        "id": str(uuid.uuid4()), "email": "mario.rossi@hera.it",
        "password_hash": hash_password("autista123"), "name": "Mario Rossi",
        "role": "driver", "driver_id": mario["id"],
        "created_at": datetime.now(timezone.utc).isoformat(),
    })


async def ensure_extras():
    """Idempotent: add Sunday (domenica) routes + a frequency example to existing demo data."""
    vehicles = await db.vehicles.find({}, {"_id": 0}).to_list(100)
    if not vehicles:
        return
    vname = {v["name"]: v["id"] for v in vehicles}

    if await db.routes.count_documents({"slot": "domenica"}) == 0:
        sunday_routes = [
            {"id": str(uuid.uuid4()), "name": "Centro - Raccolta Domenicale", "code": "DOM-CEN", "zone": "Centro", "vehicle_id": vname.get("Compattatore Piccolo"), "slot": "domenica", "schedule_mode": "fixed", "days": [6], "interval_days": 2, "start_date": None, "pinned": True},
            {"id": str(uuid.uuid4()), "name": "Mercati - Raccolta Domenicale", "code": "DOM-MER", "zone": "Centro", "vehicle_id": vname.get("Compattatore Grande"), "slot": "domenica", "schedule_mode": "fixed", "days": [6], "interval_days": 2, "start_date": None, "pinned": True},
            {"id": str(uuid.uuid4()), "name": "Lungomare - Raccolta Domenicale", "code": "DOM-LUN", "zone": "Mare", "vehicle_id": vname.get("Compattatore Piccolo"), "slot": "domenica", "schedule_mode": "fixed", "days": [6], "interval_days": 2, "start_date": None, "pinned": True},
        ]
        await db.routes.insert_many([dict(r) for r in sunday_routes])
        sunday_ids = [r["id"] for r in sunday_routes]
        sunday_vehicles = list({r["vehicle_id"] for r in sunday_routes})
        # grant Sunday skills to the first 4 active drivers
        drivers = await db.drivers.find({}, {"_id": 0}).to_list(100)
        for d in drivers[:4]:
            v = list(set(d.get("vehicle_skills", []) + sunday_vehicles))
            r = list(set(d.get("route_skills", []) + sunday_ids))
            await db.drivers.update_one({"id": d["id"]}, {"$set": {"vehicle_skills": v, "route_skills": r}})

    if await db.routes.count_documents({"schedule_mode": "frequency"}) == 0:
        drivers = await db.drivers.find({}, {"_id": 0}).to_list(100)
        freq = {
            "id": str(uuid.uuid4()), "name": "Isole Ecologiche - Ciclo", "code": "IS-ECO", "zone": "Città",
            "vehicle_id": vname.get("Vasca Scarrabile"), "slot": "standard",
            "schedule_mode": "frequency", "days": [], "interval_days": 3,
            "start_date": None, "pinned": False,
        }
        await db.routes.insert_one(dict(freq))
        for d in drivers[:3]:
            v = list(set(d.get("vehicle_skills", []) + [freq["vehicle_id"]]))
            r = list(set(d.get("route_skills", []) + [freq["id"]]))
            await db.drivers.update_one({"id": d["id"]}, {"$set": {"vehicle_skills": v, "route_skills": r}})


@app.on_event("startup")
async def on_startup():
    await db.users.create_index("email", unique=True)
    await seed()
    await ensure_extras()


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
