# Private Data Analytics (FHE demo)

This repository demonstrates a privacy‑preserving content/health‑data analytics flow. Data is encrypted on the client, sent to the server, analyzed, and the result is returned encrypted. It includes a minimal frontend, a full React frontend, and a Node.js/Express backend with optional Zama Relayer integration.

> Note: The current encryption in the demo path uses base64 for simplicity. For production FHE, integrate Zama FHE or the Zama Relayer end‑to‑end.

## Repository structure

- `backend/` — Express API server. Provides endpoints for upload and encrypted analysis. Optional Zama Relayer support.
- `frontend/` — Minimal demo frontend (vanilla, single files) that talks to the backend.
- `react-frontend/` — React app (Create React App) with a richer UI and additional PoCs.
- `docs/` — Roadmap and user‑flow notes.
- `assets/` — Static assets (social card, etc.).

## Prerequisites

- Node.js 18+ (recommended LTS)
- npm (comes with Node.js)

If you cloned this repo without node_modules (recommended), run npm install in each app before starting:

```powershell
# From the repo root
cd backend; npm install; cd ..
cd react-frontend; npm install; cd ..
# Optional minimal demo snippets (only if you plan to run them)
cd frontend; npm install; cd ..
```

## Backend: setup and run

1) Install dependencies

```powershell
cd backend
npm install
```

2) Start the server (default port 3001). By default it targets the Sepolia relayer endpoint.

```powershell
npm run dev
```

Environment variables

- `RELAYER_ENDPOINT` (optional): Override the relayer endpoint.

Example:

```powershell
$env:RELAYER_ENDPOINT="https://relayer.sepolia.zama.ai"; npm run dev
```

Key endpoints

- `GET /health` — Health check.
- `GET /relayer-status` — Whether relayer SDK is available and configured.
- `POST /relayer-selfcheck` — Validates a provided keypair by round‑tripping a small payload using the relayer.
- `POST /api/upload` — Accepts encrypted data (no persistence in demo).
- `POST /api/analyze` — Decrypts (demo/relayer), analyzes text (word/line counts, JSON/CSV detection), returns encrypted result.
- `POST /api/analyze-features` — Accepts pre‑extracted features (optionally encrypted) and returns derived metrics.
- `POST /api/add` — PoC: adds two numbers provided as encrypted or plaintext values and returns encrypted sum.
- `POST /api/sum-array` — PoC: sums a list of numbers provided as encrypted items or plaintext numbers.

Relayer headers (when using relayer)

- `x-relayer: 1`
- `x-public-key: <PUBLIC_KEY>`
- `x-private-key: <PRIVATE_KEY>`

## Minimal frontend: demo snippets

The `frontend/` folder contains minimal example code (no bundler). It’s useful as a reference for how to call the backend or the Relayer in the browser. For a ready‑to‑run UI, use the React frontend below.

## React frontend: richer UI

1) Install dependencies

```powershell
cd react-frontend
npm install
```

2) Start the app

```powershell
npm start
```

It runs at http://localhost:3000 and expects the backend at http://localhost:3001. You can change the backend URL by setting `REACT_APP_API_BASE` before starting:

```powershell
$env:REACT_APP_API_BASE="http://localhost:3001"; npm start
```

## How it works (high level)

1) Client reads the selected file and encrypts its contents locally (demo: base64; optional: Zama Relayer).
2) The encrypted blob is sent to the server for analysis.
3) Server decrypts, computes metrics and simple heuristics (top words, JSON/CSV shape), then encrypts the result and returns it.
4) Client decrypts the response and renders a structured summary.

## Troubleshooting

- Port in use: Change ports or stop conflicting services (3000 for frontend, 3001 for backend).
- CORS: Backend allows http://localhost:3000 by default; adjust in `backend/app.js` if needed.
- Relayer unavailable: Check `GET /relayer-status`. Ensure `RELAYER_ENDPOINT` is reachable and the SDK installs correctly.
- Mixed content or network errors: Verify both apps are running, and that `REACT_APP_API_BASE` matches your backend.

## Notes

- The demo uses base64 as a stand‑in for client‑side encryption. Replace with real FHE using Zama for production use.
- Do not commit real private keys. The sample keys in the demo are placeholders only.
