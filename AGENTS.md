# Guida Operativa & Contesto Agente - Gestionale HERA S.p.A.

Piattaforma aziendale per la gestione operativa della flotta veicoli, dell'organico autisti/assistenti, della pianificazione turni di raccolta e della manutenzione mezzi.

---

## 🏛️ Stack Tecnologico & Architettura

### Backend (`/backend`)
* **Framework**: FastAPI (asincrono) con Uvicorn (`server.py`).
* **Database**: MongoDB con driver asincrono `motor` (`motor.motor_asyncio`) e `pymongo`.
* **Validazione Dati**: Pydantic V2 (`BaseModel`, validatori di tipo ed email).
* **Autenticazione & Sicurezza**: JWT (`PyJWT`), crittografia password con `bcrypt`.
* **Testing**: Pytest (`tests/backend_test.py`, `pytest.ini`).
* **Virtual Environment**: Cartella locale `backend/venv/`.

### Frontend (`/frontend`)
* **Framework**: React (v19) / Create React App con Craco (`craco.config.js`).
* **Styling & UI**: Tailwind CSS, Radix UI, componenti in stile `shadcn/ui` (`frontend/src/components/ui`), Lucide React.
* **Mobile / PWA**: Integrazione Capacitor per app mobile Android nativa (`frontend/capacitor.config.json`, `frontend/android/`).
* **Gestione Pacchetti**: Yarn (`yarn.lock`) / npm.

### Infrastruttura & Utility
* **Tunnel / Rete locale**: Cloudflare Tunnel (`cloudflared.exe`, `avvia_tunnel.bat`).
* **Backup**: Script di dump e restore MongoDB in `/scripts` (`export_db_backup.py`, `restore_db_backup.py`).
* **Deploy**: Vercel (`vercel.json`) per il frontend, Render (`render.yaml`) per il backend.

---

## 📋 Regole di Dominio & Business Logic

1. **Pianificazione Turni**:
   * Fasce di servizio: Mattino Presto, Mattino Standard, Pomeriggio.
   * **Vincolo normativo riposo**: Minimo **11 ore consecutive** di riposo tra il termine di un turno e l'inizio del successivo.
   * **Mansioni & Abilitazioni**: Distinzione tra *Autista* (richiede patente C/CQC e idoneità sanitaria valida) e *Assistente di Linea*.

2. **Gestione Flotta**:
   * Monitoraggio scadenze di legge: Revisione periodica, collaudo, verifica cronotachigrafo, integrità kit medico di bordo.
   * Blocco automatico/avviso per mezzi con anomalie bloccanti non risolte.

3. **Area Dipendenti Mobile**:
   * Portale consultabile via smartphone (Capacitor/web responsive).
   * Funzioni: Presa visione turno, richieste cambio turno, segnalazione guasti/anomalie su percorso.

---

## 💻 Linee Guida di Sviluppo per l'Agente

### 1. Modifiche Chirurgiche (Risparmio Token)
* `backend/server.py` è un file esteso (> 1600 righe). **NON riscrivere mai l'intero file**. Usa sempre modifiche chirurgiche mirate per blocco/riga.
* In caso di aggiunta di nuovi moduli importanti, privilegiare la modularizzazione (es. router FastAPI in cartella dedicata `backend/routers/`).

### 2. Standard Codice Backend
* Tutte le route API devono essere asincrone (`async def`).
* Validare tutti i payload in ingresso e in uscita tramite schemi Pydantic.
* Gestire le eccezioni con `HTTPException` e messaggi in italiano leggibili dal frontend.

### 3. Standard Codice Frontend
* Componenti funzionali con React Hooks.
* Utilizzare classi Tailwind CSS coerenti con il design system aziendale.
* Mantenere la piena reattività mobile per tutte le viste accessibili dagli autisti.

---

## 🚀 Comandi di Routine Rapidi

| Operazione | Directory | Comando |
| :--- | :--- | :--- |
| **Avvio Backend (Script)** | Root | `.\avvia_backend.bat` |
| **Avvio Backend (Manuale)**| `backend/` | `.\venv\Scripts\activate; uvicorn server:app --reload --port 8000` |
| **Avvio Frontend** | `frontend/` | `yarn start` (oppure `npm start`) |
| **Esecuzione Test** | `backend/` | `.\venv\Scripts\activate; pytest tests/` |
| **Backup Database** | `backend/` | `python ..\scripts\export_db_backup.py` |
| **Ripristino Database** | Root | `.\ripristina_database.bat` |
