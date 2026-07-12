"""Backend API tests for HERA S.p.A. Turni scheduler."""
import os
import pytest
import requests
from datetime import date, timedelta

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/") if os.environ.get("REACT_APP_BACKEND_URL") else "https://route-assigner.preview.emergentagent.com"
# Fallback for backend-run tests where frontend env isn't loaded
if not BASE_URL:
    BASE_URL = "https://route-assigner.preview.emergentagent.com"

ADMIN = {"email": "admin@hera.it", "password": "admin123"}
DRIVER = {"email": "mario.rossi@hera.it", "password": "autista123"}


def monday_of_this_week():
    today = date.today()
    return (today - timedelta(days=today.weekday())).isoformat()


@pytest.fixture(scope="session")
def admin_token():
    r = requests.post(f"{BASE_URL}/api/auth/login", json=ADMIN, timeout=30)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["user"]["role"] == "admin"
    return data["token"]


@pytest.fixture(scope="session")
def driver_token():
    r = requests.post(f"{BASE_URL}/api/auth/login", json=DRIVER, timeout=30)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["user"]["role"] == "driver"
    return data["token"]


def H(token):
    return {"Authorization": f"Bearer {token}"}


# -------- Auth --------
class TestAuth:
    def test_login_admin(self, admin_token):
        assert admin_token

    def test_login_driver(self, driver_token):
        assert driver_token

    def test_login_bad(self):
        r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": "admin@hera.it", "password": "wrong"})
        assert r.status_code == 401

    def test_me_admin(self, admin_token):
        r = requests.get(f"{BASE_URL}/api/auth/me", headers=H(admin_token))
        assert r.status_code == 200
        assert r.json()["role"] == "admin"

    def test_me_no_token(self):
        r = requests.get(f"{BASE_URL}/api/auth/me")
        assert r.status_code == 401


# -------- Role guards --------
class TestRoleGuards:
    def test_driver_cannot_create_vehicle(self, driver_token):
        r = requests.post(f"{BASE_URL}/api/vehicles", json={"name": "X", "plate": "XX 000 XX"}, headers=H(driver_token))
        assert r.status_code == 403

    def test_driver_cannot_generate(self, driver_token):
        r = requests.post(f"{BASE_URL}/api/shifts/generate", json={"week_start": monday_of_this_week()}, headers=H(driver_token))
        assert r.status_code == 403

    def test_driver_can_read_drivers(self, driver_token):
        r = requests.get(f"{BASE_URL}/api/drivers", headers=H(driver_token))
        assert r.status_code == 200


# -------- Meta / seed data --------
class TestSeed:
    def test_vehicles_seeded(self, admin_token):
        r = requests.get(f"{BASE_URL}/api/vehicles", headers=H(admin_token))
        assert r.status_code == 200
        assert len(r.json()) >= 5

    def test_routes_seeded(self, admin_token):
        r = requests.get(f"{BASE_URL}/api/routes", headers=H(admin_token))
        assert r.status_code == 200
        assert len(r.json()) >= 10

    def test_drivers_seeded(self, admin_token):
        r = requests.get(f"{BASE_URL}/api/drivers", headers=H(admin_token))
        assert r.status_code == 200
        assert len(r.json()) >= 8

    def test_slots_meta(self, admin_token):
        r = requests.get(f"{BASE_URL}/api/meta/slots", headers=H(admin_token))
        assert r.status_code == 200
        data = r.json()
        assert data["slots"]["presto"]["max_drivers"] == 3


# -------- Vehicle CRUD --------
class TestVehicleCRUD:
    def test_crud(self, admin_token):
        # create
        r = requests.post(f"{BASE_URL}/api/vehicles", json={"name": "TEST_Truck", "plate": "TT 999 XX", "type": "Compattatore"}, headers=H(admin_token))
        assert r.status_code == 200
        v = r.json()
        assert v["name"] == "TEST_Truck"
        vid = v["id"]
        # get
        r2 = requests.get(f"{BASE_URL}/api/vehicles", headers=H(admin_token))
        assert any(x["id"] == vid for x in r2.json())
        # update
        r3 = requests.put(f"{BASE_URL}/api/vehicles/{vid}", json={"name": "TEST_Truck2", "plate": "TT 999 XX", "type": "Compattatore"}, headers=H(admin_token))
        assert r3.status_code == 200
        assert r3.json()["name"] == "TEST_Truck2"
        # delete
        r4 = requests.delete(f"{BASE_URL}/api/vehicles/{vid}", headers=H(admin_token))
        assert r4.status_code == 200


# -------- Driver CRUD + skills --------
class TestDriverCRUD:
    def test_crud_and_skills(self, admin_token):
        r = requests.post(f"{BASE_URL}/api/drivers", json={"name": "TEST_Driver", "email": "test_d@hera.it"}, headers=H(admin_token))
        assert r.status_code == 200
        did = r.json()["id"]
        # get vehicle & route ids
        veh = requests.get(f"{BASE_URL}/api/vehicles", headers=H(admin_token)).json()
        rts = requests.get(f"{BASE_URL}/api/routes", headers=H(admin_token)).json()
        vid = veh[0]["id"]
        rid = rts[0]["id"]
        # update skills
        r2 = requests.put(f"{BASE_URL}/api/drivers/{did}/skills", json={"vehicle_skills": [vid], "route_skills": [rid]}, headers=H(admin_token))
        assert r2.status_code == 200
        assert vid in r2.json()["vehicle_skills"]
        # update
        r3 = requests.put(f"{BASE_URL}/api/drivers/{did}", json={"name": "TEST_Driver2", "email": "test_d@hera.it"}, headers=H(admin_token))
        assert r3.status_code == 200
        # delete
        r4 = requests.delete(f"{BASE_URL}/api/drivers/{did}", headers=H(admin_token))
        assert r4.status_code == 200


# -------- Route CRUD --------
class TestRouteCRUD:
    def test_crud(self, admin_token):
        veh = requests.get(f"{BASE_URL}/api/vehicles", headers=H(admin_token)).json()
        r = requests.post(f"{BASE_URL}/api/routes", json={"name": "TEST_Route", "code": "TST-01", "zone": "Test", "vehicle_id": veh[0]["id"], "slot": "standard", "days": [0, 1, 2]}, headers=H(admin_token))
        assert r.status_code == 200
        rid = r.json()["id"]
        r2 = requests.put(f"{BASE_URL}/api/routes/{rid}", json={"name": "TEST_Route2", "code": "TST-01", "zone": "Test", "vehicle_id": veh[0]["id"], "slot": "standard", "days": [0, 1]}, headers=H(admin_token))
        assert r2.status_code == 200
        assert r2.json()["name"] == "TEST_Route2"
        r3 = requests.delete(f"{BASE_URL}/api/routes/{rid}", headers=H(admin_token))
        assert r3.status_code == 200


# -------- Generate + engine constraints --------
class TestGenerateEngine:
    def test_generate_and_presto_constraint(self, admin_token):
        wk = monday_of_this_week()
        r = requests.post(f"{BASE_URL}/api/shifts/generate", json={"week_start": wk}, headers=H(admin_token))
        assert r.status_code == 200, r.text
        stats = r.json()
        assert stats["total"] > 0
        # Fetch shifts
        r2 = requests.get(f"{BASE_URL}/api/shifts?week_start={wk}", headers=H(admin_token))
        assert r2.status_code == 200
        shifts = r2.json()
        # Presto max 3/day
        per_day = {}
        for s in shifts:
            if s["slot"] == "presto" and s["driver_id"]:
                per_day[s["day"]] = per_day.get(s["day"], 0) + 1
        for day, cnt in per_day.items():
            assert cnt <= 3, f"day {day} has {cnt} presto assignments (>3)"
        # No driver double-booked in same day
        seen = set()
        for s in shifts:
            if s["driver_id"]:
                key = (s["day"], s["driver_id"])
                assert key not in seen, f"double booking {key}"
                seen.add(key)


# -------- Substitutes + patch --------
class TestSubstitution:
    def test_substitutes_and_patch(self, admin_token):
        wk = monday_of_this_week()
        # ensure shifts exist
        requests.post(f"{BASE_URL}/api/shifts/generate", json={"week_start": wk}, headers=H(admin_token))
        shifts = requests.get(f"{BASE_URL}/api/shifts?week_start={wk}", headers=H(admin_token)).json()
        assert shifts
        sid = shifts[0]["id"]
        r = requests.get(f"{BASE_URL}/api/shifts/{sid}/substitutes", headers=H(admin_token))
        assert r.status_code == 200
        data = r.json()
        assert "candidates" in data
        # Find qualified+available candidate
        qual = [c for c in data["candidates"] if c["qualified"] and c["available"]]
        target = qual[0] if qual else data["candidates"][0]
        # Patch assign
        r2 = requests.patch(f"{BASE_URL}/api/shifts/{sid}", json={"driver_id": target["id"]}, headers=H(admin_token))
        assert r2.status_code == 200
        assert r2.json()["driver_id"] == target["id"]
        assert r2.json()["status"] == "assigned"
        # Mark absence
        r3 = requests.patch(f"{BASE_URL}/api/shifts/{sid}", json={"status": "absence"}, headers=H(admin_token))
        assert r3.status_code == 200
        assert r3.json()["driver_id"] is None
