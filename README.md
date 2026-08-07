# Skibidi Shop — Real-Time E-Commerce Engine

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?logo=typescript&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-316192?logo=postgresql&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-43853D?logo=node.js&logoColor=white)

An industry-grade, event-driven e-commerce platform designed to demonstrate real-time bidirectional communication without continuous polling. It leverages native database triggers to instantly push order state changes to connected client dashboards via WebSockets, ensuring zero-latency inventory and order tracking.

## 🚀 Key Features

- **Event-Driven Architecture**: Utilizes PostgreSQL native `LISTEN/NOTIFY` channels to eliminate database polling. Row-level mutations instantly broadcast JSON payloads to the Node.js daemon.
- **Bi-Directional WebSockets**: A lightweight `ws` server propagates state changes to authenticated frontend clients in milliseconds.
- **Secure Authentication**: Integrated Google OAuth via Firebase Admin SDK. Cryptographically validates JWT ID tokens in the Express middleware before granting access to REST endpoints.
- **Asynchronous Notifications**: A background worker queue intercepts database events to dispatch dynamic, branded HTML email receipts and shipping updates via Nodemailer (SMTP).
- **Premium UI/UX**: Hand-coded, dependency-free vanilla HTML/CSS frontend featuring a dark neon-green glassmorphism aesthetic, Space Grotesk typography, and micro-animations.

---

## 🏗️ System Architecture

1. **Client Interaction**: A customer authenticates via Google OAuth and creates an order via a secure REST `POST /api/store/orders`.
2. **Database Mutation**: The Express server inserts the order into the PostgreSQL database.
3. **PL/pgSQL Trigger**: A native database trigger detects the `INSERT/UPDATE` and executes `pg_notify()`, emitting the row payload to the `orders_channel`.
4. **Backend Daemon**: The Node.js `pg.Client` listens to the channel, parses the JSON payload, and emits an internal Node.js event.
5. **Real-Time Broadcast**: 
   - The WebSocket server pushes the update to the specific customer's browser.
   - The Nodemailer engine asynchronously fires off a tracking email.

---

## 🛠️ Technology Stack

| Layer | Technology | Purpose |
| :--- | :--- | :--- |
| **Frontend** | Vanilla HTML, CSS, JS | High-performance, zero-dependency storefront and admin portal |
| **Backend** | Node.js, Express, TypeScript | REST API, Business Logic, and WebSocket Broadcasting |
| **Database** | PostgreSQL | Relational data, `pg_notify` event streams, PL/pgSQL triggers |
| **Auth** | Firebase Admin SDK | JWT validation for Google OAuth identities |
| **Services** | Nodemailer | Asynchronous SMTP tracking emails |

---

## ⚙️ Local Development Setup

### 1. Prerequisites
- [Node.js v18+](https://nodejs.org/)
- [Docker Desktop](https://www.docker.com/) (for local PostgreSQL)

### 2. Installation
Clone the repository and install dependencies:
```bash
git clone https://github.com/YourUsername/Your-New-Repo-Name.git
cd Your-New-Repo-Name/backend
npm install
```

### 3. Environment Configuration
Create a `.env` file in the `backend/` directory:
```env
# Database
DB_HOST=127.0.0.1
DB_PORT=5433
DB_NAME=apt_orders
DB_USER=apt_user
DB_PASSWORD=apt_pass

# Access control — comma-separated admin accounts (required for the admin dashboard)
ADMIN_EMAILS=owner@example.com

# Comma-separated browser origins allowed to call the API (empty = allow all, dev only)
CORS_ORIGINS=http://localhost:3000

# SMTP Email
SMTP_USER=your_email@gmail.com
SMTP_PASS=your_app_password

# Firebase (Dynamic Frontend Config)
FIREBASE_API_KEY=your_api_key
FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
FIREBASE_PROJECT_ID=your_project
FIREBASE_STORAGE_BUCKET=your_project.firebasestorage.app
FIREBASE_MESSAGING_SENDER_ID=your_sender_id
FIREBASE_APP_ID=your_app_id
```
*(Ensure `firebase-service-key.json` is placed in the `backend/` root).*

### 4. Run the Platform
Start the PostgreSQL container:
```bash
docker compose up -d
```
Boot the backend daemon (automatically runs migrations and seeds data):
```bash
cd backend
npm run dev
```

### 5. Testing
Unit tests run against mocked PostgreSQL, Firebase, SMTP and WebSocket layers, so no database or credentials are needed:
```bash
cd backend
npm test              # run the suite
npm run test:coverage # run with a coverage report
```

### 6. Access
- **Storefront**: `http://localhost:3000`
- **Admin Dashboard**: `http://localhost:3000/admin.html`
- **Health check**: `http://localhost:3000/healthz`

### 7. Access Control
- Roles live in Postgres (`roles`, `user_roles`); Firebase only proves who the caller is. `ADMIN_EMAILS` grants the `admin` role on sign-in.
- `/api/admin/*` (and the legacy `/api/orders` alias) require the `admin` role; the dashboard UI only mirrors the server's verdict from `/api/auth/me`.
- `/api/seller/*` requires a seller account with status `active` — pending and suspended sellers are rejected server-side.
- `/api/cart/*` and `/api/store/*` require a signed-in customer and only ever touch that customer's own cart and orders.
- The WebSocket stream requires a token (`ws://host/?token=<idToken>`) and pushes an order only to its owner, plus admins.

### 8. API surface
| Area | Endpoints |
| --- | --- |
| Public catalog | `GET /api/products` (search, category, seller, price and stock filters, `sort`, cursor pagination), `GET /api/categories`, `GET /api/products/:slug`, `GET /api/sellers/:slug` |
| Customer | `GET/DELETE /api/cart`, `POST /api/cart/items`, `PATCH/DELETE /api/cart/items/:id`, `POST /api/store/checkout`, `POST /api/store/orders`, `GET /api/store/my-orders`, `GET /api/store/orders/:id` |
| Seller | `POST /api/seller/apply`, `GET /api/seller/me`, `GET/POST /api/seller/products`, `PATCH/DELETE /api/seller/products/:id`, `GET /api/seller/orders`, `GET /api/seller/metrics`, `GET /api/seller/payouts` |
| Admin | `GET/POST /api/admin/orders`, `GET/PATCH/DELETE /api/admin/orders/:id`, `GET /api/admin/sellers`, `PATCH /api/admin/sellers/:id`, `GET /api/admin/metrics`, `GET /api/admin/payouts`, `POST /api/admin/payouts/run`, `PATCH /api/admin/payouts/:id` |

Money is stored and returned in integer cents (`price_cents`, `total_cents`, …). Checkout is a single transaction that locks each product `FOR UPDATE`, validates stock and seller status, snapshots the line items, splits the commission per seller and decrements stock — so a sold-out race fails instead of overselling. Schema changes are versioned migrations recorded in `schema_migrations` and applied at boot.

---
*Designed and Developed for high-performance retail environments.*
