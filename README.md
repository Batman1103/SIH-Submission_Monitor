# SIH 2026 Submission Monitor

Full-stack dashboard for SIH 2026 submission counts.

Official source:
https://www.sih.gov.in/sih2026PS

## Run

Backend:
```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

Frontend:
```bash
cd frontend
npm install
npm run dev
```

The backend polls the official SIH page every 5 minutes by default. Change it with `SIH_SYNC_MINUTES`.

Manual sync:
```bash
curl -X POST http://localhost:8000/api/sync
```

The project deliberately shows stale/offline status if the official source cannot be refreshed. It does not bypass authentication, CAPTCHAs, rate limits, or other access controls.
# SIH-Submission_Monitor
