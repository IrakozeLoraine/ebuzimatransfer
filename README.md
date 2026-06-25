# eBuzimaTransfer

ICU/HDU referral and inter-hospital patient-transfer management system for Rwanda.

eBuzimaTransfer lets clinicians create transfer requests, lets receiving
hospitals accept or decline them based on real-time bed/resource capacity, and
tracks the assigned ambulance live on a map from pickup to arrival.

## Architecture

The system is a monorepo with four deployable pieces, wired together by Docker
Compose behind an Nginx reverse proxy.

| Component           | Path                  | Stack                                            |
| ------------------- | --------------------- | ------------------------------------------------ |
| **Backend API**     | [`backend/`](backend/)             | FastAPI, SQLAlchemy (async), Alembic, PostgreSQL |
| **Web frontend**    | [`frontend/`](frontend/)           | React 19, TypeScript, Vite, Tailwind, shadcn/ui  |
| **Ambulance app**   | [`ambulance_tracker/`](ambulance_tracker/)  | Flutter (Android/iOS GPS tracker)                |
| **Reverse proxy**   | [`nginx/`](nginx/)              | Nginx (TLS termination, routing)                 |

- The **backend** exposes a versioned REST API under `/api/v1` plus a WebSocket
  endpoint at `/ws/{channel}` for live capacity and ambulance-location updates.
  Interactive API docs are served at `/api/docs` (Swagger) and `/api/redoc`.
- **Redis** backs the WebSocket pub/sub so broadcasts reach clients across
  multiple Uvicorn workers.
- **OSRM** (a self-hosted routing server loaded with Rwanda OSM data) provides
  road distance/duration for ambulance ETAs.

## Quick start (Docker)

The fastest way to run the whole stack locally.

```bash
git clone https://github.com/IrakozeLoraine/ebuzimatransfer.git
cd ebuzimatransfer
docker compose up --build
```

On first boot the backend automatically applies migrations (`alembic upgrade
head`) and seeds reference data (`seeds.py`). Once it's up:

| Service        | URL                              |
| -------------- | -------------------------------- |
| Web app        | http://localhost (via Nginx)     |
| Frontend (dev) | http://localhost:5173            |
| API docs       | http://localhost:8000/api/docs   |
| Health check   | http://localhost:8000/health     |

> `docker compose up -d`.

## Local development (without Docker)

Run each component in its own terminal. The backend depends on **PostgreSQL**
and **Redis**, so start those first.

**Prerequisites:** Python 3.12 · Node.js 20+ · Flutter SDK (stable) ·
PostgreSQL 16 · Redis · Docker (optional, easiest way to get Postgres/Redis).

### 1. Start PostgreSQL and Redis

If you don't already run them locally, the quickest way is Docker:

```bash
docker run -d --name ebuzima-db -p 5432:5432 \
  -e POSTGRES_USER=ebuzimauser -e POSTGRES_PASSWORD=ebuzimapass -e POSTGRES_DB=ebuzimadb \
  postgres:16-alpine

docker run -d --name ebuzima-redis -p 6379:6379 redis:7-alpine
```

### 2. Backend

Requires **Python 3.12**, with Postgres and Redis reachable (Redis is needed at
startup for the live WebSocket fan-out).

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

cp .env.example .env        # then edit values (see below)
alembic upgrade head        # apply migrations
python seeds.py             # seed reference data
uvicorn app.main:app --reload   # http://localhost:8000
```

Environment variables (`backend/.env`):

| Variable                      | Description                                      | Default              |
| ----------------------------- | ------------------------------------------------ | -------------------- |
| `DATABASE_URL`                | Async PostgreSQL DSN (`postgresql+asyncpg://…`)  | _required_           |
| `SECRET_KEY`                  | JWT signing secret (use a random 256-bit value)  | _required_           |
| `JWT_ALGORITHM`               | JWT algorithm                                    | `HS256`              |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | Access-token lifetime                            | `60`                 |
| `REFRESH_TOKEN_EXPIRE_DAYS`   | Refresh-token lifetime                           | `7`                  |
| `ALLOWED_ORIGINS`             | Comma-separated CORS origins                     | `http://localhost:5173` |
| `ENVIRONMENT`                 | `development` or `production`                    | `development`        |
| `REDIS_URL`                   | Redis DSN for WebSocket fan-out                  | `redis://localhost:6379/0` |
| `OSRM_BASE_URL`               | OSRM routing server base URL                     | `http://localhost:5000` |

### 3. Frontend

Requires **Node.js 20+**, with the backend running on port 8000.

```bash
cd frontend
cp .env.example .env     # API/WS base URLs (defaults point at localhost:8000)
npm install
npm run dev              # http://localhost:5173
```

The Vite dev server proxies `/api` and `/ws` to `http://127.0.0.1:8000`, so the
frontend talks to your local backend with no extra config.

Scripts: `npm run lint`, `npm run build` (type-check + production build),
`npm run preview`.

### 4. Ambulance tracker (Flutter)

Requires the **Flutter SDK** (stable). See [`ambulance_tracker/README.md`](ambulance_tracker/README.md)
for how the driver app pairs with the backend.

```bash
cd ambulance_tracker
flutter pub get
flutter run            # on a connected device/emulator
flutter analyze        # lint
flutter test           # tests
```

---

## CI/CD

GitHub Actions pipelines live in [`.github/workflows/`](.github/workflows/).

### CI — [`ci.yml`](.github/workflows/ci.yml)

Runs on every push and pull request to `main`. Jobs run in parallel:

| Job              | What it checks                                                            |
| ---------------- | ------------------------------------------------------------------------- |
| **Backend**      | Installs deps, compiles all modules, applies Alembic migrations against a real Postgres service, and verifies the app imports. |
| **Frontend**     | `npm ci`, ESLint, and a full type-check + Vite build.                     |
| **Mobile**       | `flutter pub get`, `flutter analyze`, `flutter test`.                      |
| **Docker build** | Builds the production backend and frontend images to catch Dockerfile breakage. |

### CD — [`deploy.yml`](.github/workflows/deploy.yml)

Runs after CI succeeds on `main` (or manually via *Run workflow*). It SSHes into
the production host, fast-forwards the checkout, and runs [`deploy.sh`](deploy.sh)
(rebuild images → `docker compose up -d` → prune build cache).

Deployment is **skipped automatically** until the following repository secrets
are set (Settings → Secrets and variables → Actions):

| Secret           | Description                                          |
| ---------------- | ---------------------------------------------------- |
| `DEPLOY_HOST`    | Server hostname or IP                                |
| `DEPLOY_USER`    | SSH user                                             |
| `DEPLOY_SSH_KEY` | Private SSH key with access to the server            |
| `DEPLOY_PATH`    | Path to the repo checkout on the server              |
| `DEPLOY_PORT`    | SSH port (optional, defaults to `22`)                |

---

## Manual deployment

On a server with Docker installed and this repo checked out:

```bash
./deploy.sh
```

For HTTPS, place certificates in [`nginx/certs/`](nginx/certs/) and enable the
TLS `server` block in [`nginx/nginx.conf`](nginx/nginx.conf).

---

## Project layout

```
ebuzimatransfer/
├── backend/             FastAPI service (api/, models/, services/, repositories/, alembic/)
├── frontend/            React + Vite web console
├── ambulance_tracker/   Flutter GPS tracker app
├── nginx/               Reverse-proxy config and TLS certs
├── docker-compose.yml   Full-stack orchestration
├── deploy.sh            Build + (re)start the stack on a host
└── .github/workflows/   CI and CD pipelines
```
