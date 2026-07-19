# PRD — Hera Turni Flotta

## Problem Statement (original)
Web app per HERA S.p.A. per la pianificazione e gestione automatica dei turni di lavoro
degli autisti (raccolta rifiuti), assegnazione dei giri e gestione flotta. Il sistema genera
i turni rispettando i vincoli di formazione interna (skill matrix: abilitazione al mezzo +
abilitazione al giro) e gli orari (3 turni fissi da 6h20). L'admin ha pieno potere di modifica
manuale e una modale di sostituzione intelligente. Gli autisti hanno accesso in sola lettura.

## User Choices
- Database: MongoDB (relazioni gestite nella logica applicativa)
- Auth: email/password (JWT bearer, localStorage)
- Pianificazione: settimanale (Lun-Dom, giri demo Lun-Sab)
- Dati demo precaricati
- Branding: HERA S.p.A. (verde ambiente #00A65A, tipografia Chivo + IBM Plex)

## Architecture
- Backend: FastAPI + Motor (MongoDB). Tutte le route sotto /api.
- Frontend: React (CRA/craco) + Tailwind + shadcn/ui + lucide-react + sonner + date-fns.
- Collezioni Mongo: users, drivers, vehicles, routes (giri), shifts (pianificazione).

## User Personas
- Amministratore: gestisce anagrafiche, formazioni, genera e corregge i turni.
- Autista: consulta il tabellone settimanale condiviso (sola lettura).

## Core Requirements (static)
- Skill matrix: un autista copre un giro solo con abilitazione al mezzo E al giro.
- 3 turni fissi: Presto 05:30-11:50 (max 3 autisti/giorno), Standard 06:00-12:20, Pomeriggio 12:30-18:50.
- Motore "Genera Turni": assegna autisti qualificati e disponibili, bilancia il carico, rispetta i vincoli.
- Sostituzione intelligente: candidati filtrati per disponibilità + formazione.
- Override manuale admin; gestione assenze.
- Vista autista sola lettura, responsive.

## Implemented (2026-06)
- JWT auth (login/me), role guard admin/driver, seed admin + autista + dati demo.
- CRUD Autisti, Mezzi, Giri; matrice formazioni con salvataggio immediato.
- Engine generazione turni settimanali con vincolo presto<=3/giorno e bilanciamento carico.
- Endpoint suggerimento sostituti + PATCH turno (assegna / assenza / libera).
- Dashboard admin (matrice turni, stat coperti/scoperti, evidenziazione SCOPERTO, modale sostituzione).
- Vista autista /tabellone (I miei turni + tabellone colleghi, highlight, sola lettura).

### Iteration 2 (2026-06)
- Frequenza giro: modalità "Giorni fissi" oppure "Ogni N giorni" (interval_days + start_date opz.).
- Turno Domenica dedicato (06:00-12:20, max 3 autisti, 3 giri fissi pinned).
- Recupero giri saltati: badge "DA RECUPERARE" + pulsante "Recupera al giorno successivo"
  (crea turno di recupero il giorno dopo, marca l'originale "RIPROGRAMMATO").
- Fissaggio giro (pinned) a turno+giorno con icona lucchetto; il motore lo assegna con priorità.
- Testing: 24/24 backend pytest, frontend E2E 100% (iteration_2). Fix bug serializzazione recover.

### Iteration 5 (2026-06)
- Notifiche autista: campanella con contatore non letti su /tabellone; l'autista è avvisato quando il suo turno cambia (riassegnazione, assenza, recupero, scambio approvato).
- Richiesta cambio turno: l'autista propone il proprio turno a un collega; approvazione da parte di admin/assistente in /scambi (riassegna il turno e notifica entrambi).
- Rotazione settimanale: ogni autista lavora un solo turno per l'intera settimana (presto/standard/pomeriggio) e ruota di settimana in settimana; report autisti senza turni (GET /api/rotation).
- Vincolo riposo: il motore non assegna un turno mattutino (presto/domenica) il giorno dopo un pomeriggio.
- Creazione account autisti da parte dell'admin (password nel form Autisti o POST /drivers/{id}/credentials); badge "Accesso attivo".
- Rimossa la versione demo: niente pulsanti demo nel login, dati demo cancellati una tantum all'avvio (resta solo l'admin).
- Testing: 27/27 backend pytest + frontend E2E 100% (iteration_5).

NOTA DEPLOY: modifiche presenti solo in preview — richiedono un nuovo deploy per andare in produzione (https://route-assigner.emergent.host). I dati demo verranno rimossi in produzione al primo avvio dopo il redeploy.
- Testing: 17/17 backend pytest, frontend E2E 100% (iteration_1).

## Backlog (P1/P2)
- P1: Gestione assenze pianificate (ferie/malattia con intervallo date) e blocco in generazione.
- P1: Export/stampa PDF del tabellone settimanale.
- P2: Notifiche agli autisti su cambio turno; storico versioni pianificazione.
- P2: Dashboard analytics (ore/autista, copertura per zona).
- P2: Lifespan handler al posto di on_event; paginazione liste.

## Credentials
- Admin: admin@hera.it / admin123
- Autista: mario.rossi@hera.it / autista123
