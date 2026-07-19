"""Backend API tests for HERA S.p.A. Turni scheduler — Iteration 5.

Focus: demo removal, admin-created driver accounts, weekly slot rotation,
rest constraint, notifications, shift-swap requests. Legacy CRUD + engine
sanity kept, but strict counts on seeded demo data are removed (demo dataset
was wiped in iteration 5).
"""
import os
import uuid
import pytest
import requests
from datetime import date, datetime, timedelta

BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL")
            or "https://route-assigner.preview.emergentagent.com").rstrip("/")

ADMIN = {"email": "admin@hera.it", "password": "admin123"}
EXISTING_DRIVER = {"email": "a1@hera.it", "password": "pass123"}  # created in prev iter


def H(token):
    return {"Authorization": f"Bearer {token}"}


def monday_of_this_week():
    today = date.today()
    return (today - timedelta(days=today.weekday())).isoformat()


# ---- fixtures --------------------------------------------------------------
@pytest.fixture(scope="session")
def admin_token():
    r = requests.post(f"{BASE_URL}/api/auth/login", json=ADMIN, timeout=30)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["user"]["role"] == "admin"
    return data["token"]


@pytest.fixture(scope="session")
def existing_driver_token():
    r = requests.post(f"{BASE_URL}/api/auth/login", json=EXISTING_DRIVER, timeout=30)
    if r.status_code != 200:
        pytest.skip("Pre-existing driver a1@hera.it not available")
    return r.json()["token"]


# ============================================================================
# 1) Auth + demo removal
# ============================================================================
class TestAuthAndDemoRemoval:
    def test_login_admin(self, admin_token):
        assert admin_token

    def test_login_bad(self):
        r = requests.post(f"{BASE_URL}/api/auth/login",
                          json={"email": "admin@hera.it", "password": "wrong"})
        assert r.status_code == 401

    def test_me_no_token(self):
        r = requests.get(f"{BASE_URL}/api/auth/me")
        assert r.status_code == 401

    def test_demo_drivers_removed(self, admin_token):
        """After iteration 5 demo-cleanup, none of the old demo emails may remain."""
        drivers = requests.get(f"{BASE_URL}/api/drivers", headers=H(admin_token)).json()
        emails = {(d.get("email") or "").lower() for d in drivers}
        demo = {"mario.rossi@hera.it", "luca.bianchi@hera.it", "giulia.verdi@hera.it",
                "antonio.russo@hera.it", "sara.ferrari@hera.it", "marco.esposito@hera.it",
                "elena.romano@hera.it", "davide.colombo@hera.it"}
        assert emails.isdisjoint(demo), f"Demo drivers still present: {emails & demo}"

    def test_demo_login_removed(self):
        """mario.rossi demo account must no longer be able to log in."""
        r = requests.post(f"{BASE_URL}/api/auth/login",
                          json={"email": "mario.rossi@hera.it", "password": "autista123"})
        assert r.status_code == 401


# ============================================================================
# 2) Admin creates driver accounts
# ============================================================================
class TestDriverAccounts:
    def test_create_driver_with_password_grants_login(self, admin_token):
        """POST /drivers with password creates a login; then /drivers/{id}/credentials
        can reset it; login succeeds; has_account=True in listing."""
        email = f"TEST_dacc_{uuid.uuid4().hex[:6]}@hera.it"
        r = requests.post(f"{BASE_URL}/api/drivers",
                          json={"name": "TEST Account Driver", "email": email,
                                "phone": "0", "password": "test1234"},
                          headers=H(admin_token))
        assert r.status_code == 200, r.text
        did = r.json()["id"]
        try:
            # Login as the new driver
            lr = requests.post(f"{BASE_URL}/api/auth/login",
                               json={"email": email, "password": "test1234"})
            assert lr.status_code == 200, lr.text
            udata = lr.json()
            assert udata["user"]["role"] == "driver"
            assert udata["user"].get("driver_id") == did

            # Listing shows has_account=True
            lst = requests.get(f"{BASE_URL}/api/drivers", headers=H(admin_token)).json()
            d = next(x for x in lst if x["id"] == did)
            assert d["has_account"] is True

            # Reset via credentials endpoint
            cr = requests.post(f"{BASE_URL}/api/drivers/{did}/credentials",
                               json={"password": "newpass9"}, headers=H(admin_token))
            assert cr.status_code == 200
            lr2 = requests.post(f"{BASE_URL}/api/auth/login",
                                json={"email": email, "password": "newpass9"})
            assert lr2.status_code == 200
        finally:
            requests.delete(f"{BASE_URL}/api/drivers/{did}", headers=H(admin_token))

    def test_credentials_requires_email(self, admin_token):
        """400 when driver has no email."""
        r = requests.post(f"{BASE_URL}/api/drivers",
                          json={"name": "TEST NoEmail", "email": "", "phone": ""},
                          headers=H(admin_token))
        assert r.status_code == 200
        did = r.json()["id"]
        try:
            cr = requests.post(f"{BASE_URL}/api/drivers/{did}/credentials",
                               json={"password": "abcd"}, headers=H(admin_token))
            assert cr.status_code == 400
        finally:
            requests.delete(f"{BASE_URL}/api/drivers/{did}", headers=H(admin_token))

    def test_credentials_admin_only(self, admin_token, existing_driver_token):
        """Driver role must not be able to set credentials."""
        drivers = requests.get(f"{BASE_URL}/api/drivers", headers=H(admin_token)).json()
        did = drivers[0]["id"]
        r = requests.post(f"{BASE_URL}/api/drivers/{did}/credentials",
                          json={"password": "hackme"}, headers=H(existing_driver_token))
        assert r.status_code == 403


# ============================================================================
# 3) Weekly rotation
# ============================================================================
class TestRotation:
    W1 = "2026-06-01"   # Monday
    W2 = "2026-06-08"

    def test_rotation_endpoint_shape(self, admin_token):
        r = requests.get(f"{BASE_URL}/api/rotation?week_start={self.W1}",
                         headers=H(admin_token))
        assert r.status_code == 200
        data = r.json()
        assert data["week_start"] == self.W1
        assert isinstance(data["rotation"], list)
        for row in data["rotation"]:
            assert row["slot"] in ("presto", "standard", "pomeriggio")

    def test_rotation_advances_week_to_week(self, admin_token):
        a = requests.get(f"{BASE_URL}/api/rotation?week_start={self.W1}",
                         headers=H(admin_token)).json()["rotation"]
        b = requests.get(f"{BASE_URL}/api/rotation?week_start={self.W2}",
                         headers=H(admin_token)).json()["rotation"]
        if len(a) < 2:
            pytest.skip("Not enough drivers to verify rotation shift")
        # At least one driver's slot must differ between the two weeks.
        by_id_a = {r["driver_id"]: r["slot"] for r in a}
        by_id_b = {r["driver_id"]: r["slot"] for r in b}
        changed = [d for d in by_id_a if d in by_id_b and by_id_a[d] != by_id_b[d]]
        assert changed, "Rotation did not shift between consecutive weeks"

    def test_generate_respects_weekly_rotation(self, admin_token):
        """After /shifts/generate, every assigned driver has shifts in only ONE
        weekday slot (domenica excluded)."""
        gr = requests.post(f"{BASE_URL}/api/shifts/generate",
                           json={"week_start": self.W1}, headers=H(admin_token))
        assert gr.status_code == 200, gr.text
        stats = gr.json()
        assert "unassigned_drivers" in stats
        assert isinstance(stats["unassigned_drivers"], list)

        rotation = requests.get(f"{BASE_URL}/api/rotation?week_start={self.W1}",
                                headers=H(admin_token)).json()["rotation"]
        expected = {r["driver_id"]: r["slot"] for r in rotation}

        shifts = requests.get(f"{BASE_URL}/api/shifts?week_start={self.W1}",
                              headers=H(admin_token)).json()
        by_driver = {}
        for s in shifts:
            if not s["driver_id"] or s["slot"] == "domenica":
                continue
            by_driver.setdefault(s["driver_id"], set()).add(s["slot"])
        for did, slots in by_driver.items():
            assert len(slots) == 1, f"Driver {did} got multiple weekday slots {slots}"
            # And that slot matches the rotation map
            assert next(iter(slots)) == expected.get(did), (
                f"Driver {did} assigned {slots} but rotation says {expected.get(did)}"
            )

    def test_rest_constraint_no_early_after_pomeriggio(self, admin_token):
        """Given rotation, no driver may have presto/domenica on day d if they
        had pomeriggio on d-1. Verified against generated data."""
        requests.post(f"{BASE_URL}/api/shifts/generate",
                      json={"week_start": self.W1}, headers=H(admin_token))
        shifts = requests.get(f"{BASE_URL}/api/shifts?week_start={self.W1}",
                              headers=H(admin_token)).json()
        pom_days = {}  # driver_id -> set(day)
        for s in shifts:
            if s["driver_id"] and s["slot"] == "pomeriggio":
                pom_days.setdefault(s["driver_id"], set()).add(s["day"])
        violations = []
        for s in shifts:
            if s["driver_id"] and s["slot"] in ("presto", "domenica"):
                if (s["day"] - 1) in pom_days.get(s["driver_id"], set()):
                    violations.append(s)
        assert not violations, f"Rest constraint violated: {violations}"

    def test_no_double_booking_same_day(self, admin_token):
        shifts = requests.get(f"{BASE_URL}/api/shifts?week_start={self.W1}",
                              headers=H(admin_token)).json()
        seen = set()
        for s in shifts:
            if s["driver_id"]:
                key = (s["day"], s["driver_id"])
                assert key not in seen, f"Double booking {key}"
                seen.add(key)


# ============================================================================
# 4) Driver notifications
# ============================================================================
class TestNotifications:
    WK = "2026-06-15"

    def _make_driver_with_shift(self, admin_token):
        """Create a fresh driver with skills, generate the week, return
        (driver_id, driver_token, a shift assigned to them)."""
        email = f"TEST_notif_{uuid.uuid4().hex[:6]}@hera.it"
        # copy skills from an existing active driver to guarantee assignability
        drivers = requests.get(f"{BASE_URL}/api/drivers", headers=H(admin_token)).json()
        proto = next((d for d in drivers if d.get("active", True)
                      and d.get("vehicle_skills") and d.get("route_skills")), None)
        assert proto, "No proto driver with skills to copy"
        cr = requests.post(f"{BASE_URL}/api/drivers",
                           json={"name": "TEST Notif", "email": email, "phone": "0",
                                 "password": "test1234"},
                           headers=H(admin_token))
        assert cr.status_code == 200
        did = cr.json()["id"]
        requests.put(f"{BASE_URL}/api/drivers/{did}/skills",
                     json={"vehicle_skills": proto["vehicle_skills"],
                           "route_skills": proto["route_skills"]},
                     headers=H(admin_token))
        tok = requests.post(f"{BASE_URL}/api/auth/login",
                            json={"email": email, "password": "test1234"}).json()["token"]
        # Regenerate week
        requests.post(f"{BASE_URL}/api/shifts/generate",
                      json={"week_start": self.WK}, headers=H(admin_token))
        shifts = requests.get(f"{BASE_URL}/api/shifts?week_start={self.WK}",
                              headers=H(admin_token)).json()
        mine = next((s for s in shifts if s["driver_id"] == did), None)
        # If rotation left this driver unassigned, force-assign one via PATCH
        if not mine:
            free = next((s for s in shifts if not s["driver_id"] and s["slot"] != "domenica"), None)
            if not free:
                # pick any and steal it
                free = shifts[0]
            pr = requests.patch(f"{BASE_URL}/api/shifts/{free['id']}",
                                json={"driver_id": did}, headers=H(admin_token))
            assert pr.status_code == 200
            mine = pr.json()
        return did, tok, mine

    def test_notify_on_reassign_and_mark_read(self, admin_token):
        did, tok, shift = self._make_driver_with_shift(admin_token)
        try:
            # Baseline
            n0 = requests.get(f"{BASE_URL}/api/notifications", headers=H(tok)).json()
            base = len(n0)
            # Mark absence -> should notify prev driver ("removed")
            r = requests.patch(f"{BASE_URL}/api/shifts/{shift['id']}",
                               json={"status": "absence"}, headers=H(admin_token))
            assert r.status_code == 200
            n1 = requests.get(f"{BASE_URL}/api/notifications", headers=H(tok)).json()
            assert len(n1) >= base + 1, "No notification created on absence"
            assert any(not n["read"] for n in n1), "Expected at least one unread"
            # Mark read
            mr = requests.post(f"{BASE_URL}/api/notifications/read",
                               json={"ids": [n1[0]["id"]]}, headers=H(tok))
            assert mr.status_code == 200
            n2 = requests.get(f"{BASE_URL}/api/notifications", headers=H(tok)).json()
            hit = next(n for n in n2 if n["id"] == n1[0]["id"])
            assert hit["read"] is True
        finally:
            requests.delete(f"{BASE_URL}/api/drivers/{did}", headers=H(admin_token))

    def test_notifications_require_driver(self, admin_token):
        """Admin has no driver_id -> endpoint returns []."""
        r = requests.get(f"{BASE_URL}/api/notifications", headers=H(admin_token))
        assert r.status_code == 200
        assert r.json() == []


# ============================================================================
# 5) Shift swap requests
# ============================================================================
class TestSwapRequests:
    WK = "2026-06-22"

    def _bootstrap_two_drivers(self, admin_token):
        """Create two driver accounts + shift on driver A, return
        (a_id, a_tok, b_id, b_tok, shift)."""
        drivers = requests.get(f"{BASE_URL}/api/drivers", headers=H(admin_token)).json()
        proto = next((d for d in drivers if d.get("vehicle_skills") and d.get("route_skills")), None)
        assert proto
        made = []
        toks = {}
        for tag in ("A", "B"):
            email = f"TEST_swap{tag}_{uuid.uuid4().hex[:5]}@hera.it"
            r = requests.post(f"{BASE_URL}/api/drivers",
                              json={"name": f"TEST Swap {tag}", "email": email,
                                    "phone": "0", "password": "test1234"},
                              headers=H(admin_token))
            assert r.status_code == 200
            did = r.json()["id"]
            made.append(did)
            requests.put(f"{BASE_URL}/api/drivers/{did}/skills",
                         json={"vehicle_skills": proto["vehicle_skills"],
                               "route_skills": proto["route_skills"]},
                         headers=H(admin_token))
            toks[tag] = requests.post(f"{BASE_URL}/api/auth/login",
                                      json={"email": email, "password": "test1234"}).json()["token"]
        # Generate + assign one shift explicitly to A
        requests.post(f"{BASE_URL}/api/shifts/generate",
                      json={"week_start": self.WK}, headers=H(admin_token))
        shifts = requests.get(f"{BASE_URL}/api/shifts?week_start={self.WK}",
                              headers=H(admin_token)).json()
        target = next((s for s in shifts if s["slot"] != "domenica"), shifts[0])
        pr = requests.patch(f"{BASE_URL}/api/shifts/{target['id']}",
                            json={"driver_id": made[0]}, headers=H(admin_token))
        assert pr.status_code == 200
        return made[0], toks["A"], made[1], toks["B"], pr.json()

    def test_swap_approve_reassigns_and_notifies(self, admin_token):
        a_id, a_tok, b_id, b_tok, shift = self._bootstrap_two_drivers(admin_token)
        try:
            # A requests swap to B
            cr = requests.post(f"{BASE_URL}/api/swap-requests",
                               json={"shift_id": shift["id"], "to_driver_id": b_id,
                                     "note": "TEST swap"}, headers=H(a_tok))
            assert cr.status_code == 200, cr.text
            swid = cr.json()["id"]

            # Admin sees it
            lst = requests.get(f"{BASE_URL}/api/swap-requests", headers=H(admin_token)).json()
            assert any(x["id"] == swid and x["status"] == "pending" for x in lst)

            # Driver B sees it too (his own inbox)
            lst_b = requests.get(f"{BASE_URL}/api/swap-requests", headers=H(b_tok)).json()
            assert any(x["id"] == swid for x in lst_b)

            # Approve
            ap = requests.patch(f"{BASE_URL}/api/swap-requests/{swid}",
                                json={"status": "approved"}, headers=H(admin_token))
            assert ap.status_code == 200
            assert ap.json()["status"] == "approved"

            # Shift reassigned to B
            sh = requests.get(f"{BASE_URL}/api/shifts?week_start={self.WK}",
                              headers=H(admin_token)).json()
            reassigned = next(s for s in sh if s["id"] == shift["id"])
            assert reassigned["driver_id"] == b_id
            assert reassigned["status"] == "assigned"

            # Both drivers received a "swap" notification
            na = requests.get(f"{BASE_URL}/api/notifications", headers=H(a_tok)).json()
            nb = requests.get(f"{BASE_URL}/api/notifications", headers=H(b_tok)).json()
            assert any(n["kind"] == "swap" for n in na), "A missing swap notification"
            assert any(n["kind"] == "swap" for n in nb), "B missing swap notification"
        finally:
            for did in (a_id, b_id):
                requests.delete(f"{BASE_URL}/api/drivers/{did}", headers=H(admin_token))

    def test_swap_reject_no_reassign(self, admin_token):
        a_id, a_tok, b_id, b_tok, shift = self._bootstrap_two_drivers(admin_token)
        try:
            cr = requests.post(f"{BASE_URL}/api/swap-requests",
                               json={"shift_id": shift["id"], "to_driver_id": b_id,
                                     "note": ""}, headers=H(a_tok))
            swid = cr.json()["id"]
            ap = requests.patch(f"{BASE_URL}/api/swap-requests/{swid}",
                                json={"status": "rejected"}, headers=H(admin_token))
            assert ap.status_code == 200
            assert ap.json()["status"] == "rejected"
            sh = requests.get(f"{BASE_URL}/api/shifts?week_start={self.WK}",
                              headers=H(admin_token)).json()
            still_a = next(s for s in sh if s["id"] == shift["id"])
            assert still_a["driver_id"] == a_id, "Shift must not move on reject"
        finally:
            for did in (a_id, b_id):
                requests.delete(f"{BASE_URL}/api/drivers/{did}", headers=H(admin_token))

    def test_swap_validation(self, admin_token):
        a_id, a_tok, b_id, _b_tok, shift = self._bootstrap_two_drivers(admin_token)
        try:
            # Cannot swap someone else's shift → change shift to B first
            requests.patch(f"{BASE_URL}/api/shifts/{shift['id']}",
                           json={"driver_id": b_id}, headers=H(admin_token))
            r = requests.post(f"{BASE_URL}/api/swap-requests",
                              json={"shift_id": shift["id"], "to_driver_id": b_id, "note": ""},
                              headers=H(a_tok))
            assert r.status_code == 400
            # Admin cannot create a swap (no driver_id)
            r2 = requests.post(f"{BASE_URL}/api/swap-requests",
                               json={"shift_id": shift["id"], "to_driver_id": b_id, "note": ""},
                               headers=H(admin_token))
            assert r2.status_code == 403
        finally:
            for did in (a_id, b_id):
                requests.delete(f"{BASE_URL}/api/drivers/{did}", headers=H(admin_token))

    def test_only_admin_decides(self, admin_token, existing_driver_token):
        # driver cannot PATCH swap-requests
        r = requests.patch(f"{BASE_URL}/api/swap-requests/does-not-exist",
                           json={"status": "approved"}, headers=H(existing_driver_token))
        assert r.status_code == 403


# ============================================================================
# 6) Regression — role guards, CRUD, substitution, absences
# ============================================================================
class TestRegression:
    def test_driver_cannot_create_vehicle(self, existing_driver_token):
        r = requests.post(f"{BASE_URL}/api/vehicles",
                          json={"name": "X", "plate": "XX 000 XX"},
                          headers=H(existing_driver_token))
        assert r.status_code == 403

    def test_driver_cannot_generate(self, existing_driver_token):
        r = requests.post(f"{BASE_URL}/api/shifts/generate",
                          json={"week_start": monday_of_this_week()},
                          headers=H(existing_driver_token))
        assert r.status_code == 403

    def test_slots_meta(self, admin_token):
        r = requests.get(f"{BASE_URL}/api/meta/slots", headers=H(admin_token))
        assert r.status_code == 200
        data = r.json()
        for sl in ("presto", "standard", "pomeriggio", "domenica"):
            assert sl in data["slots"]
        assert data["slots"]["presto"]["max_drivers"] == 3
        assert data["slots"]["domenica"]["max_drivers"] == 3

    def test_vehicle_crud(self, admin_token):
        r = requests.post(f"{BASE_URL}/api/vehicles",
                          json={"name": "TEST_Truck", "plate": "TT 999 XX", "type": "Compattatore"},
                          headers=H(admin_token))
        assert r.status_code == 200
        vid = r.json()["id"]
        try:
            r3 = requests.put(f"{BASE_URL}/api/vehicles/{vid}",
                              json={"name": "TEST_Truck2", "plate": "TT 999 XX", "type": "Compattatore"},
                              headers=H(admin_token))
            assert r3.status_code == 200
            assert r3.json()["name"] == "TEST_Truck2"
        finally:
            requests.delete(f"{BASE_URL}/api/vehicles/{vid}", headers=H(admin_token))

    def test_route_crud_with_frequency(self, admin_token):
        veh = requests.get(f"{BASE_URL}/api/vehicles", headers=H(admin_token)).json()
        assert veh, "Need at least one vehicle"
        payload = {"name": "TEST_Freq", "code": "TST-FR", "zone": "TZ",
                   "vehicle_id": veh[0]["id"], "slot": "standard",
                   "schedule_mode": "frequency", "days": [], "interval_days": 4,
                   "start_date": "2026-06-01", "pinned": False}
        r = requests.post(f"{BASE_URL}/api/routes", json=payload, headers=H(admin_token))
        assert r.status_code == 200
        rid = r.json()["id"]
        try:
            assert r.json()["schedule_mode"] == "frequency"
            assert r.json()["interval_days"] == 4
        finally:
            requests.delete(f"{BASE_URL}/api/routes/{rid}", headers=H(admin_token))

    def test_substitutes_and_patch(self, admin_token):
        wk = "2026-06-01"
        requests.post(f"{BASE_URL}/api/shifts/generate", json={"week_start": wk}, headers=H(admin_token))
        shifts = requests.get(f"{BASE_URL}/api/shifts?week_start={wk}", headers=H(admin_token)).json()
        if not shifts:
            pytest.skip("No shifts generated")
        sid = shifts[0]["id"]
        r = requests.get(f"{BASE_URL}/api/shifts/{sid}/substitutes", headers=H(admin_token))
        assert r.status_code == 200
        assert "candidates" in r.json()

    def test_absence_invalid_range(self, admin_token):
        drv = requests.get(f"{BASE_URL}/api/drivers", headers=H(admin_token)).json()
        if not drv:
            pytest.skip("No drivers")
        r = requests.post(f"{BASE_URL}/api/absences",
                          json={"driver_id": drv[0]["id"], "type": "ferie",
                                "start_date": "2026-07-05", "end_date": "2026-07-01"},
                          headers=H(admin_token))
        assert r.status_code == 400

    def test_absence_crud(self, admin_token):
        drv = requests.get(f"{BASE_URL}/api/drivers", headers=H(admin_token)).json()
        if not drv:
            pytest.skip("No drivers")
        r = requests.post(f"{BASE_URL}/api/absences",
                          json={"driver_id": drv[0]["id"], "type": "ferie",
                                "start_date": "2026-07-01", "end_date": "2026-07-03",
                                "note": "TEST_abs"}, headers=H(admin_token))
        assert r.status_code == 200
        aid = r.json()["id"]
        try:
            lst = requests.get(f"{BASE_URL}/api/absences", headers=H(admin_token)).json()
            assert any(a["id"] == aid for a in lst)
        finally:
            requests.delete(f"{BASE_URL}/api/absences/{aid}", headers=H(admin_token))
