# Gestionale HERA S.p.A. - Gestione Flotta, Personale e Turni

Piattaforma aziendale completa per la gestione operativa della flotta veicoli, dell'organico autisti/assistenti, della pianificazione settimanale dei turni di raccolta e del tracciamento manutenzioni/dotazioni di bordo.

---

## Panoramica Funzionale

- **Dashboard Operativa**: Indicatori in tempo reale su veicoli operativi, autisti in servizio, anomalie aperte e scadenze imminenti.
- **Pianificazione Turni**: Matrice settimanale con rotazione automatica degli slot di servizio (Mattino Presto, Mattino Standard, Pomeriggio), gestione vincoli di riposo (min. 11 ore) e sostituzioni intelligenti basate su abilitazioni e mansioni.
- **Gestione Autisti e Assistenti**: Anagrafica dipendenti, profili di accesso dedicati, mansioni (Autista, Assistente di Linea), patenti, idoneità sanitarie e tracciamento presenze.
- **Gestione Flotta & Manutenzioni**: Registro mezzi, scadenze revisione/collaudo/cronotachigrafo, monitoraggio kit medico e cronologia manutenzioni.
- **Gestione Linee e Percorsi**: Definizione delle rotte di raccolta, requisiti di idoneità veicolo e personale.
- **Area Dipendenti Mobile**: Portale self-service per la consultazione del proprio turno, conferma presa visione, richiesta cambio turno e segnalazione anomalie.

---

## Architettura Tecnica

- **Backend**: Python 3.11+ / FastAPI con architettura asincrona, motor MongoDB per persistenza dati, autenticazione JWT e crittografia password con bcrypt.
- **Frontend**: React 19 con Tailwind CSS, Radix UI e Lucide Icons.
- **Mobile**: Supporto nativo Android multipiattaforma tramite integrazione Capacitor.
- **Hosting / Deploy**: Backend cloud scalabile su Render e frontend statico ottimizzato.

---

## Configurazione e Avvio Locale

### Prerequisiti
- Python 3.11 o superiore
- Node.js 18+ e Yarn
- MongoDB (locale o cloud MongoDB Atlas)

### 1. Avvio Backend
```bash
cd backend
python -m venv venv
venv\Scripts\activate       # Su Windows
pip install -r requirements.txt
uvicorn server:app --host 0.0.0.0 --port 8000 --reload
```

### 2. Avvio Frontend
```bash
cd frontend
yarn install
yarn start
```

Il frontend sarà accessibile su `http://localhost:3000`.

---

## Test di Integrazione
I test di suite dell'API sono configurati con Pytest:
```bash
cd backend
pytest tests/backend_test.py
```
