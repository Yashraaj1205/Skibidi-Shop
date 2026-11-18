# ⚡ Skibidi Shop

A full-stack, real-time e-commerce application built with Node.js, Express, TypeScript, PostgreSQL, WebSockets, and Groq AI. 

Instead of traditional client polling, Skibidi Shop uses native PostgreSQL `LISTEN/NOTIFY` triggers and bi-directional WebSockets to push order updates and status changes to clients in real-time.

---

## ✨ Features

- **Real-Time Order Tracking**: Row-level database triggers (`LISTEN/NOTIFY`) propagate status changes (`pending` → `shipped` → `delivered`) instantly over WebSockets without client polling.
- **500+ Product Catalog**: Over 500 tech items across 12 categories with dynamic filtering (category, brand, price range, in-stock status, customer ratings).
- **Instant Prefix Search**: Fast search using PostgreSQL `ILIKE` prefix matching and `tsvector` full-text search, matching instantly on single keystrokes (`m` → `mo` → `motorola`).
- **3-Step Checkout Flow**: Complete checkout cycle with customer delivery coordinates, payment method selection (Card, UPI, COD, Net Banking), coupon engine (`SKIBIDI10`, `WELCOME20`, `CHAD50`, `FREESHIP`), and a printable tax invoice with PDF export.
- **AI Shopping Assistant**: An in-browser chatbot powered by Groq Cloud. Product recommendations are grounded directly in database inventory to prevent hallucinations.
- **Admin Dashboard**: A dedicated, tab-scoped admin portal (`/admin.html`) with live order status controls, business KPIs, and sales analytics.
- **Transactional Emails**: Asynchronous order confirmation and delivery status dispatch using Nodemailer via SMTP.
- **Google OAuth Authentication**: Secure token verification using Firebase Admin SDK with session persistence isolation between customer and admin logins.

---

## 🛠️ Tech Stack

| Layer | Technologies |
|---|---|
| **Backend** | Node.js, Express, TypeScript, `pg` (node-postgres), `ws` (WebSockets) |
| **Frontend** | Vanilla JavaScript (ES6+), HTML5, CSS3 Glassmorphism |
| **Database** | PostgreSQL 16 (Dockerized), PL/pgSQL Triggers, Full-Text Search |
| **AI Inference** | Groq Cloud API |
| **Authentication** | Firebase Authentication (Google OAuth 2.0), Firebase Admin SDK |
| **Email** | Nodemailer (SMTP) |

---

## 📐 System Architecture

### High-Level Architecture

```mermaid
flowchart TD
    subgraph Frontend["Frontend Clients"]
        Store["Storefront (index.html)\nCatalog, Cart, 3-Step Checkout, AI Assistant"]
        Admin["Admin Portal (admin.html)\nLive KPIs, Order Manager"]
    end

    subgraph Backend["Node.js / Express Server"]
        API["REST API Router\n/api/products, /api/cart, /api/store, /api/orders, /api/ai"]
        AuthMW["Firebase Auth Middleware"]
        AIRouter["AI Controller & RAG Engine"]
        WSS["WebSocket Server (ws)"]
        DBListener["PostgreSQL Listener Daemon (LISTEN 'orders_channel')"]
        EmailWorker["SMTP Email Worker (Nodemailer)"]
    end

    subgraph Database["PostgreSQL 16 (Docker)"]
        PG[("Database\n500+ Products, Orders, Users, Cart")]
        Trigger[/"PL/pgSQL Trigger\norders_change_trigger"/]
        Channel[["pg_notify('orders_channel')"]]
    end

    Store & Admin -->|"HTTP REST Requests (Bearer Token)"| API
    API -->|"SQL Queries (pg.Pool)"| PG
    Store & Admin <-->|"Bi-directional WebSockets"| WSS

    Store -->|"AI Query"| AIRouter
    AIRouter -->|"Fetch Matching Products"| PG
    AIRouter -->|"Prompt + Catalog Context"| GroqAPI["Groq Cloud LLM"]
    GroqAPI -->|"Structured Response"| AIRouter

    PG -->|"Row INSERT / UPDATE"| Trigger
    Trigger --> Channel
    Channel -->|"Notification Stream"| DBListener
    DBListener -->|"Broadcast Event"| WSS
    DBListener -->|"Send Email Receipt"| EmailWorker
```

---

### Real-Time Event Flow

```mermaid
sequenceDiagram
    autonumber
    actor Customer as Customer Browser
    participant API as Express API
    participant DB as PostgreSQL
    participant Trigger as PL/pgSQL Trigger
    participant Listener as Node.js Listener
    participant WS as WebSocket Server
    actor Admin as Admin Dashboard

    Customer->>API: POST /api/store/checkout (JWT Auth)
    API->>DB: INSERT INTO orders (...)
    DB->>Trigger: AFTER INSERT FOR EACH ROW
    Trigger->>DB: PERFORM pg_notify('orders_channel', payload)
    DB-->>Listener: Socket Notification Received
    API-->>Customer: 201 Created (Order Response)

    par Real-Time Broadcast
        Listener->>WS: Emit order_change
        WS-->>Customer: Push order update to tracker
        WS-->>Admin: Push new order to live feed
    and Email Dispatch
        Listener->>Customer: 📧 Dispatch order confirmation email
    end

    Note over Admin,DB: Status Update
    Admin->>API: PATCH /api/orders/:id { status: 'shipped' }
    API->>DB: UPDATE orders SET status='shipped'
    DB->>Trigger: AFTER UPDATE FOR EACH ROW
    Trigger->>DB: PERFORM pg_notify('orders_channel', payload)
    DB-->>Listener: Notification Received ('UPDATE')
    API-->>Admin: 200 OK
    Listener->>WS: Push status change
    WS-->>Customer: Progress bar updates to 'Shipped'
```

---

## 🗄️ Database Schema

```mermaid
erDiagram
    users ||--o{ orders : places
    users ||--o{ cart_items : owns
    categories ||--o{ products : classifies
    products ||--o{ cart_items : "contains"

    users {
        int id PK
        string firebase_uid UK
        string email
        string display_name
        timestamp created_at
    }

    products {
        int id PK
        string name
        string description
        decimal price
        string category
        string brand
        decimal rating
        int review_count
        boolean in_stock
        tsvector search_vector
    }

    cart_items {
        int id PK
        int user_id FK
        int product_id FK
        int quantity
    }

    orders {
        int id PK
        int user_id FK
        string customer_name
        string customer_email
        string product_name
        string status
        string shipping_address
        string payment_method
        decimal total_amount
        string coupon_code
        string phone
        timestamp updated_at
    }
```

---

## 🚀 Getting Started

### 1. Prerequisites
- [Node.js](https://nodejs.org/) (v18+)
- [Docker & Docker Compose](https://www.docker.com/)
- A free API key from [Groq Cloud](https://groq.com)
- Firebase Project with Google Authentication enabled

### 2. Clone and Setup
```bash
git clone https://github.com/Yashraaj1205/Skibidi-Shop.git
cd Skibidi-Shop
```

### 3. Start Database
```bash
docker-compose up -d
```
*PostgreSQL starts on port `5433` (User: `apt_user`, Pass: `apt_pass`, DB: `apt_orders`).*

### 4. Configure Environment
Copy `.env.example` to `.env` inside `backend/`:
```bash
cp backend/.env.example backend/.env
```
Update `backend/.env` with your credentials:
```env
DB_HOST=127.0.0.1
DB_PORT=5433
DB_NAME=apt_orders
DB_USER=apt_user
DB_PASSWORD=apt_pass

FIREBASE_SERVICE_ACCOUNT_PATH=./firebase-service-key.json

SMTP_USER=your_email@gmail.com
SMTP_PASS=your_google_app_password

FIREBASE_API_KEY=AIzaSy...
FIREBASE_AUTH_DOMAIN=your-app.firebaseapp.com
FIREBASE_PROJECT_ID=your-app

GROQ_API_KEY=gsk_...
```

### 5. Install & Run
```bash
cd backend
npm install
npm run dev
```

The app will be available at:
- **Storefront**: `http://localhost:3000`
- **Admin Portal**: `http://localhost:3000/admin.html`

---

## 📡 API Reference

### Products
- `GET /api/products` — Paginated product search, filtering, and sorting
- `GET /api/products/categories` — List all categories with product counts
- `GET /api/products/:id` — Single product details

### Cart
- `GET /api/cart` — Get current user's cart items
- `POST /api/cart` — Add product to cart
- `PATCH /api/cart/:itemId` — Update item quantity
- `DELETE /api/cart/:itemId` — Remove item from cart

### Orders & Checkout
- `POST /api/store/orders` — Direct single-item order placement
- `POST /api/store/checkout` — Multi-item cart checkout with shipping and payment details
- `GET /api/store/my-orders` — Customer order history

### Admin
- `GET /api/orders` — View all orders
- `PATCH /api/orders/:id` — Update order status (`pending` → `shipped` → `delivered`)
- `GET /api/ai/analytics` — Business KPIs and inventory analytics

### AI Assistant
- `POST /api/ai/chat` — Grounded shopping assistant chat
- `POST /api/ai/admin-chat` — Business metrics advisor chat

---

## 📄 License

This project is licensed under the MIT License.
