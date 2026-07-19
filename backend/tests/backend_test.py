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


# -------- New: Domenica slot + max 3 --------
class TestDomenicaSlot:
    def test_slots_meta_has_domenica(self, admin_token):
        r = requests.get(f"{BASE_URL}/api/meta/slots", headers=H(admin_token))
        assert r.status_code == 200
        data = r.json()
        assert "domenica" in data["slots"]
        assert data["slots"]["domenica"]["max_drivers"] == 3

    def test_sunday_pinned_routes_seeded(self, admin_token):
        r = requests.get(f"{BASE_URL}/api/routes", headers=H(admin_token))
        assert r.status_code == 200
        codes = {x["code"]: x for x in r.json()}
        for c in ("DOM-CEN", "DOM-MER", "DOM-LUN"):
            assert c in codes, f"Missing pinned Sunday route {c}"
            assert codes[c]["pinned"] is True
            assert codes[c]["slot"] == "domenica"
            assert codes[c]["days"] == [6]

    def test_frequency_route_seeded(self, admin_token):
        r = requests.get(f"{BASE_URL}/api/routes", headers=H(admin_token))
        rts = {x["code"]: x for x in r.json()}
        assert "IS-ECO" in rts
        iseco = rts["IS-ECO"]
        assert iseco["schedule_mode"] == "frequency"
        assert iseco["interval_days"] == 3
        assert iseco["slot"] == "standard"


# -------- New: Generate week 2026-06-01 (Monday) --------
class TestGenerateSpecificWeek:
    WK = "2026-06-01"

    def test_generate_and_domenica_and_frequency(self, admin_token):
        r = requests.post(f"{BASE_URL}/api/shifts/generate", json={"week_start": self.WK}, headers=H(admin_token))
        assert r.status_code == 200, r.text
        shifts = requests.get(f"{BASE_URL}/api/shifts?week_start={self.WK}", headers=H(admin_token)).json()
        assert shifts

        # Domenica: exactly 3 shifts, all on day=6
        dom = [s for s in shifts if s["slot"] == "domenica"]
        assert len(dom) == 3, f"Expected 3 domenica shifts, got {len(dom)}"
        assert all(s["day"] == 6 for s in dom), "Domenica shift not on day 6"
        assert all(s.get("pinned") is True for s in dom), "Sunday routes should be pinned"

        # Presto max 3/day (assigned)
        per_day = {}
        for s in shifts:
            if s["slot"] == "presto" and s["driver_id"]:
                per_day[s["day"]] = per_day.get(s["day"], 0) + 1
        for day, cnt in per_day.items():
            assert cnt <= 3, f"Presto day {day} has {cnt} > 3"

        # Domenica max 3 assigned on day 6
        dom_assigned = [s for s in dom if s["driver_id"]]
        assert len(dom_assigned) <= 3

        # Frequency IS-ECO: 2026-06-01 is Monday; interval=3 no start_date => days 0, 3 (Mon, Thu)
        routes = requests.get(f"{BASE_URL}/api/routes", headers=H(admin_token)).json()
        iseco_id = next(r["id"] for r in routes if r["code"] == "IS-ECO")
        iseco_shifts = sorted({s["day"] for s in shifts if s["route_id"] == iseco_id})
        assert iseco_shifts == [0, 3], f"IS-ECO expected days [0,3] got {iseco_shifts}"


# -------- New: Recovery flow --------
class TestRecovery:
    WK = "2026-06-15"

    def _find_uncovered(self, admin_token):
        # Force generate then find an uncovered non-Sunday shift with day < 6
        requests.post(f"{BASE_URL}/api/shifts/generate", json={"week_start": self.WK}, headers=H(admin_token))
        shifts = requests.get(f"{BASE_URL}/api/shifts?week_start={self.WK}", headers=H(admin_token)).json()
        # find any uncovered
        for s in shifts:
            if not s["driver_id"] and s["status"] == "uncovered" and s["day"] < 6:
                return s
        # if none uncovered, force one by marking absence
        target = next((s for s in shifts if s["driver_id"] and s["day"] < 6), None)
        if not target:
            pytest.skip("No shift to test recovery")
        requests.patch(f"{BASE_URL}/api/shifts/{target['id']}", json={"status": "absence"}, headers=H(admin_token))
        return requests.get(f"{BASE_URL}/api/shifts?week_start={self.WK}", headers=H(admin_token)).json()
        # Actually just refetch and return that one
    def test_recover_creates_makeup(self, admin_token):
        requests.post(f"{BASE_URL}/api/shifts/generate", json={"week_start": self.WK}, headers=H(admin_token))
        shifts = requests.get(f"{BASE_URL}/api/shifts?week_start={self.WK}", headers=H(admin_token)).json()
        target = next((s for s in shifts if not s["driver_id"] and s["day"] < 6), None)
        if not target:
            # force one absence
            cand = next(s for s in shifts if s["driver_id"] and s["day"] < 6)
            requests.patch(f"{BASE_URL}/api/shifts/{cand['id']}", json={"status": "absence"}, headers=H(admin_token))
            target = requests.get(f"{BASE_URL}/api/shifts?week_start={self.WK}", headers=H(admin_token)).json()
            target = next(s for s in target if s["id"] == cand["id"])

        r = requests.post(f"{BASE_URL}/api/shifts/{target['id']}/recover", headers=H(admin_token))
        assert r.status_code == 200, r.text
        makeup = r.json()
        assert makeup["recovery"] is True
        assert makeup["route_id"] == target["route_id"]
        assert makeup["day"] == min(target["day"] + 1, 6)
        assert makeup["id"] != target["id"]

        # Verify original marked recovered
        shifts2 = requests.get(f"{BASE_URL}/api/shifts?week_start={self.WK}", headers=H(admin_token)).json()
        orig = next(s for s in shifts2 if s["id"] == target["id"])
        assert orig["status"] == "recovered"

        # Verify makeup exists in list
        assert any(s["id"] == makeup["id"] and s["recovery"] is True for s in shifts2)


# -------- New: Route CRUD with frequency + domenica + pinned --------
class TestRouteExtras:
    def test_create_frequency_route(self, admin_token):
        veh = requests.get(f"{BASE_URL}/api/vehicles", headers=H(admin_token)).json()
        payload = {
            "name": "TEST_Freq Route", "code": "TST-FR", "zone": "TZ",
            "vehicle_id": veh[0]["id"], "slot": "standard",
            "schedule_mode": "frequency", "days": [], "interval_days": 4,
            "start_date": "2026-06-01", "pinned": False,
        }
        r = requests.post(f"{BASE_URL}/api/routes", json=payload, headers=H(admin_token))
        assert r.status_code == 200
        data = r.json()
        assert data["schedule_mode"] == "frequency"
        assert data["interval_days"] == 4
        assert data["start_date"] == "2026-06-01"
        requests.delete(f"{BASE_URL}/api/routes/{data['id']}", headers=H(admin_token))

class TestAbsences:
    WK = "2026-06-08"

    def test_driver_cannot_create_absence(self, driver_token, admin_token):
        drv = requests.get(f"{BASE_URL}/api/drivers", headers=H(admin_token)).json()[0]
        r = requests.post(f"{BASE_URL}/api/absences",
                          json={"driver_id": drv["id"], "type": "ferie", "start_date": "2026-06-01", "end_date": "2026-06-02"},
                          headers=H(driver_token))
        assert r.status_code == 403

    def test_driver_can_list_absences(self, driver_token):
        r = requests.get(f"{BASE_URL}/api/absences", headers=H(driver_token))
        assert r.status_code == 200

    def test_invalid_date_range(self, admin_token):
        drv = requests.get(f"{BASE_URL}/api/drivers", headers=H(admin_token)).json()[0]
        r = requests.post(f"{BASE_URL}/api/absences",
                          json={"driver_id": drv["id"], "type": "ferie", "start_date": "2026-06-05", "end_date": "2026-06-01"},
                          headers=H(admin_token))
        assert r.status_code == 400

    def test_crud_absence(self, admin_token):
        drv = requests.get(f"{BASE_URL}/api/drivers", headers=H(admin_token)).json()[0]
        r = requests.post(f"{BASE_URL}/api/absences",
                          json={"driver_id": drv["id"], "type": "ferie", "start_date": "2026-07-01", "end_date": "2026-07-03", "note": "TEST_abs"},
                          headers=H(admin_token))
        assert r.status_code == 200
        aid = r.json()["id"]
        # verify persisted
        lst = requests.get(f"{BASE_URL}/api/absences", headers=H(admin_token)).json()
        assert any(a["id"] == aid for a in lst)
        # update
        r2 = requests.put(f"{BASE_URL}/api/absences/{aid}",
                          json={"driver_id": drv["id"], "type": "malattia", "start_date": "2026-07-01", "end_date": "2026-07-04", "note": "TEST_abs"},
                          headers=H(admin_token))
        assert r2.status_code == 200
        assert r2.json()["type"] == "malattia"
        # delete
        r3 = requests.delete(f"{BASE_URL}/api/absences/{aid}", headers=H(admin_token))
        assert r3.status_code == 200

    def test_engine_excludes_absent_and_substitute_flags(self, admin_token):
        # Pick a driver who currently has shifts on Mon+Tue in WK to make the assertion meaningful
        # Generate baseline
        requests.post(f"{BASE_URL}/api/shifts/generate", json={"week_start": self.WK}, headers=H(admin_token))
        shifts = requests.get(f"{BASE_URL}/api/shifts?week_start={self.WK}", headers=H(admin_token)).json()
        # pick a driver with shift on day 0 or day 1
        target_id = None
        for s in shifts:
            if s["driver_id"] and s["day"] in (0, 1):
                target_id = s["driver_id"]
                break
        assert target_id, "No baseline shift found for absence test"

        # Create absence Mon+Tue
        ar = requests.post(f"{BASE_URL}/api/absences",
                           json={"driver_id": target_id, "type": "ferie", "start_date": "2026-06-08", "end_date": "2026-06-09", "note": "TEST_engine"},
                           headers=H(admin_token))
        assert ar.status_code == 200
        aid = ar.json()["id"]
        try:
            # Regenerate
            requests.post(f"{BASE_URL}/api/shifts/generate", json={"week_start": self.WK}, headers=H(admin_token))
            shifts2 = requests.get(f"{BASE_URL}/api/shifts?week_start={self.WK}", headers=H(admin_token)).json()
            # Zero shifts on day 0 and 1
            absent_day_shifts = [s for s in shifts2 if s["driver_id"] == target_id and s["day"] in (0, 1)]
            assert absent_day_shifts == [], f"Absent driver got shifts on absent days: {absent_day_shifts}"
            # But may have shifts on other days
            other_day_shifts = [s for s in shifts2 if s["driver_id"] == target_id and s["day"] not in (0, 1)]
            # not strictly required, but sanity
            _ = other_day_shifts

            # Substitutes: find a shift on day 0 and check that target_id appears with absent=true, available=false
            day0_shift = next((s for s in shifts2 if s["day"] == 0), None)
            assert day0_shift
            subs = requests.get(f"{BASE_URL}/api/shifts/{day0_shift['id']}/substitutes", headers=H(admin_token)).json()
            entry = next((c for c in subs["candidates"] if c["id"] == target_id), None)
            assert entry is not None, "Absent driver missing from substitute candidates list"
            assert entry["absent"] is True
            assert entry["available"] is False
        finally:
            requests.delete(f"{BASE_URL}/api/absences/{aid}", headers=H(admin_token))


    def test_create_domenica_pinned_route(self, admin_token):
        veh = requests.get(f"{BASE_URL}/api/vehicles", headers=H(admin_token)).json()
        payload = {
            "name": "TEST_Dom", "code": "TST-DOM", "zone": "Z",
            "vehicle_id": veh[0]["id"], "slot": "domenica",
            "schedule_mode": "fixed", "days": [6], "interval_days": 2,
            "start_date": None, "pinned": True,
        }
        r = requests.post(f"{BASE_URL}/api/routes", json=payload, headers=H(admin_token))
        assert r.status_code == 200
        data = r.json()
        assert data["slot"] == "domenica"
        assert data["pinned"] is True
        assert data["days"] == [6]
        requests.delete(f"{BASE_URL}/api/routes/{data['id']}", headers=H(admin_token))
