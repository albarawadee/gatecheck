# GateCheck

QR guest check-in for events. Each guest gets a personal QR code; staff scan it at the gate and the guest is checked in once.

## Features
- Guest list imported from Excel, grouped by party, with seat and invite numbers
- QR code per guest (generate and print)
- Camera scanner at the gate; a second scan shows "already checked in"
- Check in a whole party at once, look up by seat, live check-in stats
- Staff accounts with login

## Stack
- `web/` — React + Vite + TypeScript, QR scanning with ZXing
- `server/` — Node.js + Express, JWT auth, Supabase / Postgres (Prisma schema)

## Run
```sh
cd server && npm install && npm run dev
cd web && npm install && npm run dev
```
`web/.env`: `VITE_API_URL` (the server URL). Server secrets go in `server/.env` (never committed).
