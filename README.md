# Skibidi Shop — Real-Time E-Commerce Engine

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?logo=typescript&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-316192?logo=postgresql&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-43853D?logo=node.js&logoColor=white)

An industry-grade, event-driven e-commerce platform designed to demonstrate real-time bidirectional communication without continuous polling. It leverages native database triggers to instantly push order state changes to connected client dashboards via WebSockets, ensuring zero-latency inventory and order tracking.

## 🚀 Key Features

- **Event-Driven Architecture**: Utilizes PostgreSQL native `LISTEN/NOTIFY` channels to eliminate database polling. Row-level mutations instantly broadcast JSON payloads to the Node.js daemon.
- **Bi-Directional WebSockets**: A lightweight `ws` server propagates state changes to authenticated frontend clients in milliseconds.
- **Secure Authentication**: Integrated Google OAuth via Firebase Admin SDK. Cryptographically validates JWT ID tokens in the Express middleware before granting access to REST endpoints and WebSocket connections. Admin endpoints (`/api/orders`) additionally require the caller's email to be listed in `ADMIN_EMAILS`.
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

# Admin access (comma-separated emails allowed to use /api/orders)
ADMIN_EMAILS=owner@example.com

# CORS (comma-separated browser origins allowed to call the API)
ALLOWED_ORIGINS=http://localhost:3000

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

### 5. Access
- **Storefront**: `http://localhost:3000`
- **Admin Dashboard**: `http://localhost:3000/admin.html`

---
*Designed and Developed for high-performance retail environments.*
