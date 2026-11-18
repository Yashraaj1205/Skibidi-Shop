# ⚡ Skibidi Shop — Next-Gen Real-Time E-Commerce Engine & AI Advisor

[![TypeScript](https://img.shields.io/badge/TypeScript-5.3-blue.svg?logo=typescript)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-v18+-green.svg?logo=node.js)](https://nodejs.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-336791.svg?logo=postgresql)](https://www.postgresql.org/)
[![Docker](https://img.shields.io/badge/Docker-20+-2496ED.svg?logo=docker)](https://www.docker.com/)
[![WebSockets](https://img.shields.io/badge/WebSockets-RFC_6455-orange.svg)](https://developer.mozilla.org/en-US/docs/Web/API/WebSockets_API)
[![Groq AI](https://img.shields.io/badge/AI_Engine-Groq_Cloud-f55036.svg)](https://groq.com/)
[![Firebase](https://img.shields.io/badge/Firebase-Admin_SDK-FFCA28.svg?logo=firebase)](https://firebase.google.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

An enterprise-grade, event-driven e-commerce platform built to eliminate client polling through native database triggers and bi-directional WebSockets. Features a catalog of **528 tech products across 12 categories**, instant character-by-character prefix search, shopping cart with **professional 3-step checkout & tax invoice generation**, isolated admin portal with tab-scoped session authentication, cryptographically verified Google OAuth via Firebase Admin, automated transactional email pipeline via Nodemailer, and **an integrated Groq-powered AI Shopping Assistant ("Skibidi AI") & Executive AI Business Advisor**.

---

## 📑 Table of Contents
1. [Executive Overview](#-executive-overview)
2. [High-Level Design (HLD)](#-high-level-design-hld)
   - [System Architecture](#system-architecture)
   - [Core Event-Driven Workflow](#core-event-driven-workflow)
   - [Professional 3-Step Checkout & Tax Invoice Flow](#professional-3-step-checkout--tax-invoice-flow)
   - [Grounded AI Assistant Architecture (RAG)](#grounded-ai-assistant-architecture-rag)
3. [Low-Level Design (LLD)](#-low-level-design-lld)
   - [Database Entity-Relationship Diagram](#database-entity-relationship-diagram)
   - [Database Trigger & Notification Engine](#database-trigger--notification-engine)
   - [Instant Prefix & Full-Text Search Engine](#instant-prefix--full-text-search-engine)
   - [Authentication & Multi-Tenant Session Isolation](#authentication--multi-tenant-session-isolation)
   - [AI RAG & Prompt Hardening Architecture](#ai-rag--prompt-hardening-architecture)
   - [WebSocket Broadcast & Lifecycle Management](#websocket-broadcast--lifecycle-management)
4. [REST API Specification](#-rest-api-specification)
5. [Repository Structure](#-repository-structure)
6. [Local Deployment & Setup Guide](#-local-deployment--setup-guide)
7. [Completed Milestones](#-completed-milestones)

---

## 🎯 Executive Overview

Traditional e-commerce platforms suffer from excessive server load caused by client polling (`setInterval` / `GET /orders`), leading to delayed state transitions and inconsistent inventory views. 

**Skibidi Shop** demonstrates an **event-driven, push-based architecture coupled with database-grounded AI**:
- **Zero Polling**: Row-level database mutations instantly broadcast JSON payloads via native PostgreSQL `LISTEN/NOTIFY` channels.
- **Microsecond Invalidation**: Node.js acts as a non-blocking daemon listening directly to PostgreSQL socket streams and immediately pushing state to connected clients via WebSockets (`ws`).
- **528-Product Scalable Catalog**: Multi-faceted filtering (brand, category, price, ratings, availability) and instant character-by-character search across 12 distinct departments.
- **Professional 3-Step Checkout**: Complete checkout cycle: Shipping address input → Payment method selection (Card, UPI, COD, Net Banking) with coupon discounts → Official tax invoice generation with PDF printing.
- **Storefront & Admin Session Isolation**: Admin portal moved to dedicated `/admin.html` using an isolated Firebase app instance with `SESSION` persistence, allowing independent concurrent logins in the same browser.
- **Customer AI Shopping Assistant ("Skibidi AI")**: Powered by Groq Cloud models, acting like Amazon's Rufus. Dynamically retrieves relevant products from the local database before prompting, guaranteeing zero hallucinations.
- **Executive AI Business Advisor**: Gives the store owner a dedicated Chief Growth Officer AI capable of querying database analytics in real-time to suggest inventory reorders, pricing strategies, and fulfillment optimizations.
- **Asynchronous Worker Notifications**: Intercepts database mutations to asynchronously dispatch branded HTML tracking receipts via SMTP (Nodemailer) with zero impact on request-response latency.

---

## 🏛️ High-Level Design (HLD)

### System Architecture

```mermaid
flowchart TD
    subgraph Clients["Frontend Clients (Vanilla HTML/CSS/JS)"]
        Store["🛒 Storefront (Port 3000)\nSearch, Filters, Cart, Modal, Live Orders"]
        Admin["⚙️ Admin Portal (/admin.html)\nLive KPIs, Order Mutator, AI Advisor"]
        AIChatWidget["🤖 Skibidi AI Chatbot Widget\n(Personal Shopping Consultant)"]
    end

    subgraph AuthProvider["Identity Provider"]
        GAuth["Google OAuth 2.0"]
        FB["Firebase Authentication\n(Store: Local Persistence | Admin: Session Persistence)"]
        GAuth --> FB
    end

    subgraph AIPlatform["AI Cloud Inference (100% Free)"]
        Groq["Groq Cloud API\nHigh-throughput LLMs (~500 t/s)"]
    end

    subgraph BackendDaemon["Backend Engine (Node.js + Express + TypeScript)"]
        API["Express REST Router\n(/api/products, /api/cart, /api/store, /api/orders, /api/ai)"]
        AuthMW["Firebase Admin Auth Middleware\n(Cryptographic JWT Verifier)"]
        AIRouter["AI Controller & RAG Grounding Engine\n(Context Injector + Prompt Hardener)"]
        WSS["WebSocket Server (ws)\nBroadcast Engine"]
        DBListener["PostgreSQL Event Listener Daemon\n(Dedicated pg.Client)"]
        EmailWorker["SMTP Transactional Email Engine\n(Nodemailer)"]
    end

    subgraph StorageLayer["Data & Event Stream Layer (Docker)"]
        PG[("PostgreSQL 16 DB\n(Port 5433)\n528 Products, FTS Indexes")]
        Channel[["LISTEN/NOTIFY\nChannel: 'orders_channel'"]]
        Trigger[/"PL/pgSQL Trigger\norders_change_trigger"/]
    end

    Clients -->|"1. Authenticate"| FB
    FB -->|"2. Return JWT ID Token"| Clients
    Clients -->|"3. HTTP REST Requests (Bearer Token)"| AuthMW
    AuthMW --> API
    API -->|"4. SQL Queries (Pool Client)"| PG

    %% AI Flow
    AIChatWidget -->|"User Shopping Query"| AIRouter
    Admin -->|"Executive Question"| AIRouter
    AIRouter -->|"Extract Keywords & Query Matching Products/KPIs"| PG
    PG -->|"Factual Database Context"| AIRouter
    AIRouter -->|"System Prompt + Catalog Context + User Message"| Groq
    Groq -->|"Grounded Advice & Product Recommendations"| AIRouter
    AIRouter -->|"Structured Reply + Product Cards"| Clients

    %% Event Flow
    PG -->|"5. Row Mutation (INSERT/UPDATE/DELETE)"| Trigger
    Trigger -->|"6. pg_notify('orders_channel', payload)"| Channel
    Channel -->|"7. Socket Notification Stream"| DBListener

    DBListener -->|"8a. Internal Event: 'order_change'"| WSS
    DBListener -->|"8b. Dispatch Asynchronous Email"| EmailWorker
    EmailWorker -->|"9. Branded HTML Receipt / Shipping Update"| Clients
    WSS -->|"10. Push Frame to Authenticated WS Connection"| Clients
```

---

### Core Event-Driven Workflow

```mermaid
sequenceDiagram
    autonumber
    actor Customer as Customer (Browser)
    participant REST as Express REST API
    participant DB as PostgreSQL Database
    participant Trigger as PL/pgSQL Trigger
    participant Daemon as Node.js Listener Daemon
    participant WS as WebSocket Server
    participant SMTP as Nodemailer SMTP Worker
    actor Admin as Admin Dashboard

    Customer->>REST: POST /api/store/checkout or /orders (JWT Auth)
    REST->>DB: INSERT INTO orders (user_id, product_name, status='pending', shipping_address, payment_method, total_amount)
    DB->>Trigger: AFTER INSERT ON orders FOR EACH ROW
    Trigger->>DB: PERFORM pg_notify('orders_channel', json_build_object(...))
    DB-->>Daemon: Notification Received on 'orders_channel'
    REST-->>Customer: 201 Created (Order Response)

    par Real-Time Client Broadcast
        Daemon->>WS: dbEvents.emit('order_change', payload)
        WS-->>Customer: Push WebSocket message (status: pending)
        WS-->>Admin: Push WebSocket message (New order in stream)
    and Asynchronous Notification Dispatch
        Daemon->>SMTP: dispatchEmail(event)
        SMTP-->>Customer: 📧 Order Confirmation Email Dispatched
    end

    Note over Admin,DB: Admin Updates Order Status
    Admin->>REST: PATCH /api/orders/:id { status: 'shipped' }
    REST->>DB: UPDATE orders SET status='shipped', updated_at=NOW()
    DB->>Trigger: AFTER UPDATE ON orders FOR EACH ROW
    Trigger->>DB: PERFORM pg_notify('orders_channel', payload)
    DB-->>Daemon: Notification Received ('UPDATE', status='shipped')
    REST-->>Admin: 200 OK

    par Real-Time Status Propagation
        Daemon->>WS: Push order_change (UPDATE)
        WS-->>Customer: Real-Time UI Progress Bar jumps to 'Shipped'
    and Asynchronous Shipping Notification
        Daemon->>SMTP: sendOrderStatusUpdateEmail()
        SMTP-->>Customer: 🚚 Shipping Update Email Dispatched
    end
```

---

### Professional 3-Step Checkout & Tax Invoice Flow

```mermaid
flowchart LR
    Step1["📦 Step 1: Shipping Details\n• Name & Email (Pre-filled)\n• Phone & Street Address\n• City, State, PIN Code"] --> Step2["💳 Step 2: Payment & Review\n• Card, UPI, COD, Net Banking\n• Coupon Engine (SKIBIDI10, etc.)\n• Itemized Summary & 5% Tax"]
    Step2 --> Server["🚀 Backend Atomic Checkout\n• Validates stock & user JWT\n• Creates order with metadata\n• Triggers DB Event & SMTP Email"]
    Server --> Step3["🧾 Step 3: Official Tax Invoice\n• Unique #INV-2026-XXXX & TXN ID\n• Complete Itemized Cost Table\n• Print / PDF Save Option"]
```

1. **Step 1 — Shipping & Contact Validation**: Collects delivery coordinates (full name, email, phone number, street delivery address, city, state, postal code). Form is automatically pre-filled with the authenticated user's Google profile credentials.
2. **Step 2 — Payment Method & Coupon Engine**:
   - **Payment Rails**: Credit / Debit Card (with card number, MM/YY, CVV inputs), Instant UPI / QR Code (Google Pay, PhonePe, Paytm, BHIM), Cash on Delivery (COD), and Net Banking.
   - **Dynamic Coupon Engine**: Promotional codes (`SKIBIDI10` for 10% off, `WELCOME20` for 20% off, `CHAD50` for 50% discount up to $100, `FREESHIP` for extra delivery savings).
   - **Live Bill Breakdown**: Real-time calculation computing item subtotal, active discount deduction, free shipping tier, estimated 5% tax, and grand total.
3. **Step 3 — Official Tax Invoice & Order Receipt**:
   - Generates an official tax invoice with serial number, issuance timestamp, customer billing/shipping details, payment method, verified transaction ID, and itemized receipt table.
   - Includes one-click PDF printing / save functionality via `window.print()` with custom print CSS that strips non-printable modal chrome.

---

### Grounded AI Assistant Architecture (RAG)

```mermaid
sequenceDiagram
    autonumber
    actor User as Shopper (Storefront)
    participant ChatUI as Skibidi AI Widget
    participant Backend as Express Backend (/api/ai/chat)
    participant DB as PostgreSQL (Products FTS & ILIKE)
    participant Groq as Groq Cloud (Free Inference API)

    User->>ChatUI: "What's the best noise-cancelling headphones under $250?"
    ChatUI->>Backend: POST /api/ai/chat { message, history }
    Backend->>Backend: Sanitize query, extract stop-words
    Backend->>DB: Query products matching keywords ('noise', 'cancelling', 'headphones') & in_stock=TRUE
    DB-->>Backend: Returns Sony WH-1000XM5, Bose QC45, Sennheiser ANC ($199 - $249)
    Backend->>Backend: Inject retrieved items into system prompt as Grounded Catalog Context
    Backend->>Groq: Prompt: System Guardrails + Catalog Context + Dialogue History + User Query
    Groq-->>Backend: Structured recommendation comparing battery, sound, and comfort with [Product #ID] tags
    Backend-->>ChatUI: Response { reply: text, products: [matchingProductObjects] }
    ChatUI-->>User: Displays conversational advice + Interactive Product Cards with "+ Cart" & "View"
```

---

## 🔬 Low-Level Design (LLD)

### Database Entity-Relationship Diagram

```mermaid
erDiagram
    users ||--o{ orders : places
    users ||--o{ cart_items : owns
    users ||--o{ reviews : writes
    categories ||--o{ products : classifies
    categories ||--o{ categories : "parent of"
    products ||--o{ cart_items : "added as"
    products ||--o{ reviews : receives

    users {
        int id PK
        string firebase_uid UK
        string email
        string display_name
        string photo_url
        timestamp created_at
    }

    categories {
        int id PK
        string name UK
        string slug UK
        string icon
        int parent_id FK
    }

    products {
        int id PK
        string name
        string description
        decimal price
        decimal original_price
        decimal discount_pct
        string image_url
        string_array image_urls
        string category
        int category_id FK
        string brand
        decimal rating
        int review_count
        string_array tags
        int stock_quantity
        boolean in_stock
        tsvector search_vector
        timestamp created_at
    }

    cart_items {
        int id PK
        int user_id FK
        int product_id FK
        int quantity
        timestamp added_at
    }

    reviews {
        int id PK
        int product_id FK
        int user_id FK
        int rating
        string comment
        timestamp created_at
    }

    orders {
        int id PK
        string customer_name
        string customer_email
        int user_id FK
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

### Database Trigger & Notification Engine

The core zero-polling backbone is implemented via native PL/pgSQL database triggers. When any row in the `orders` table is inserted, updated, or deleted, the trigger formats the row as JSON and emits it directly into PostgreSQL's internal IPC bus via `pg_notify`.

```sql
CREATE OR REPLACE FUNCTION notify_orders_change()
RETURNS TRIGGER AS $$
DECLARE
  payload JSON;
BEGIN
  IF TG_OP = 'DELETE' THEN
    payload = json_build_object(
      'operation', TG_OP,
      'data',      row_to_json(OLD),
      'timestamp', NOW()
    );
    PERFORM pg_notify('orders_channel', payload::TEXT);
    RETURN OLD;
  ELSE
    payload = json_build_object(
      'operation', TG_OP,
      'data',      row_to_json(NEW),
      'timestamp', NOW()
    );
    PERFORM pg_notify('orders_channel', payload::TEXT);
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER orders_change_trigger
AFTER INSERT OR UPDATE OR DELETE ON orders
FOR EACH ROW EXECUTE FUNCTION notify_orders_change();
```

#### Node.js Listener Daemon (`backend/src/db/listener.ts`)
A dedicated, persistent `pg.Client` establishes a dedicated connection specifically to listen on `orders_channel`. It operates independently from the general query connection pool:
- Includes **automatic exponential reconnection backoff** (`scheduleReconnect()`) if the database restarts or connection drops.
- Upon receiving a payload, it triggers in-memory event dispatching (`EventEmitter`) and initiates non-blocking email delivery.

---

### Instant Prefix & Full-Text Search Engine

Traditional PostgreSQL full-text search (`plainto_tsquery`) only matches complete words and misses single-character keystrokes like "m" or partial words like "mo". 

To deliver an instant e-commerce search experience, Skibidi Shop uses a **hybrid multi-predicate query** that merges prefix matching, word-boundary matching, brand matching, and stemmed GIN full-text search:

```sql
SELECT p.*, c.name as category_name
FROM products p
LEFT JOIN categories c ON p.category_id = c.id
WHERE (
  p.name ILIKE $1                     -- Starts with query (e.g. 'm%')
  OR p.name ILIKE $2                  -- Word starting with query (e.g. '% m%')
  OR p.brand ILIKE $1                 -- Brand starts with query
  OR p.category ILIKE $1              -- Category starts with query
  OR search_vector @@ plainto_tsquery('english', $3) -- Fallback FTS
)
ORDER BY (
  CASE 
    WHEN p.name ILIKE $1 THEN 1       -- Prioritize exact prefix matches
    WHEN p.name ILIKE $2 THEN 2       -- Then word-boundary matches
    WHEN p.brand ILIKE $1 THEN 3      -- Then brand matches
    ELSE 4 
  END
), p.rating DESC, p.id ASC
LIMIT 20;
```

---

### Authentication & Multi-Tenant Session Isolation

To resolve session interference between store customers and administrators sharing the same browser:
- **Storefront (`index.html`)**: Uses default Firebase app instance with persistent `LOCAL` storage so customers remain signed in across visits.
- **Admin Portal (`admin.html`)**: Isolated to a named Firebase app instance (`AdminApp`) using `firebase.auth.Auth.Persistence.SESSION`. 
- **Tab Isolation**: An admin login is isolated to the browser session tab and never overwrites or clashes with customer credentials in the storefront.

```mermaid
flowchart LR
    StoreTab["Storefront Tab (index.html)\nfirebase.initializeApp(config) [DEFAULT]\nPersistence: LOCAL"] -. Isolated .- AdminTab["Admin Tab (admin.html)\nfirebase.initializeApp(config, 'AdminApp')\nPersistence: SESSION"]
```

---

### AI RAG & Prompt Hardening Architecture

Implemented in [backend/src/api/ai.ts](file:///d:/Skibidi-Shop/backend/src/api/ai.ts):
1. **Dynamic RAG Grounding**: Before sending prompts to Groq, the backend cleans the user query, extracts keywords, and performs a search against the local `products` table. Only real products currently in stock are fed into the prompt.
2. **Strict Guardrails**:
   - Instructs the AI to act strictly as a shopping assistant.
   - Refuses code execution, system prompt leaks, or unrelated requests.
   - Restricts recommendations solely to products supplied in the catalog context.
3. **Admin Business Intelligence**:
   - The admin endpoint queries real KPIs (order counts, delivery ratios, top-selling items, low-stock items) via parameterized SQL and feeds them to the AI, allowing the store executive to discuss business metrics, restock priorities, and promotional strategies.

---

### WebSocket Broadcast & Lifecycle Management

Implemented via the high-performance `ws` package in [backend/src/ws/server.ts](file:///d:/Skibidi-Shop/backend/src/ws/server.ts):
- **Keep-Alive Heartbeats**: Sends 30-second ping/pong frames to detect dead client sockets and prevent zombie connection memory leaks.
- **Selective Multiplexing**: Frontend clients verify incoming messages against their session email, ensuring users only see their own order updates, while admin dashboards receive omniscient event streams.

---

## 📡 REST API Specification

### 1. AI Assistant & Analytics
| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `POST` | `/api/ai/chat` | Public | Customer Shopping Assistant. Takes `{ message, history }`, queries DB for matching products, and calls Groq with grounded context. |
| `POST` | `/api/ai/admin-chat` | Admin | Chief Growth Officer AI. Answers business strategy and sales questions based on live database metrics. |
| `GET` | `/api/ai/analytics` | Public | Returns real-time KPI metrics (total orders, status counts, low-stock count) for admin dashboards. |

### 2. Products & Catalog
| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `GET` | `/api/products` | Public | Paginated list with prefix search (`?q=`), category (`?category=`), brand (`?brand=`), price range (`?minPrice=&maxPrice=`), inStock (`?inStock=`), and sorting (`?sort=`). |
| `GET` | `/api/products/categories` | Public | List all 12 categories with product counts. |
| `GET` | `/api/products/meta/filters` | Public | Available brands with count distributions and price min/max. |
| `GET` | `/api/products/:id` | Public | Single product details with joined category and specs. |
| `GET` | `/api/products/:id/reviews` | Public | Fetch verified customer reviews for a product. |
| `POST` | `/api/products/:id/reviews` | JWT | Submit a customer rating and review. |

### 3. Shopping Cart
| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `GET` | `/api/cart` | JWT | Get authenticated user's shopping cart items with product metadata. |
| `POST` | `/api/cart` | JWT | Add or increment product in cart (validates inventory stock). |
| `PATCH` | `/api/cart/:itemId` | JWT | Modify cart item quantity (0 removes item). |
| `DELETE` | `/api/cart/:itemId` | JWT | Remove single item from cart. |
| `DELETE` | `/api/cart` | JWT | Clear user's entire cart. |

### 4. Storefront Orders & Checkout
| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `POST` | `/api/store/orders` | JWT | Direct purchase for a single product with shipping & payment details. |
| `POST` | `/api/store/checkout` | JWT | Checkout all items in cart with shipping address, payment method, coupon code, and total amount. |
| `GET` | `/api/store/my-orders` | JWT | Retrieve all past and active orders for authenticated customer. |

### 5. Admin Management
| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `GET` | `/api/orders` | Admin | Retrieve all customer orders across the platform. |
| `POST` | `/api/orders` | Admin | Create manual order test payloads. |
| `PATCH` | `/api/orders/:id` | Admin | Update status (`pending` → `shipped` → `delivered`). Fires trigger and updates client UI. |
| `DELETE` | `/api/orders/:id` | Admin | Delete an order by ID. |

---

## 📂 Repository Structure

```text
Skibidi-Shop/
├── docker-compose.yml             # PostgreSQL 16 Alpine container definition
├── README.md                      # Complete system documentation (HLD/LLD)
├── .gitignore                     # Git exclusions (.env, node_modules, keys)
├── backend/
│   ├── .env                       # Local secrets (DB, SMTP, Firebase, Groq)
│   ├── .env.example               # Example template for environment config
│   ├── firebase-service-key.json  # Firebase Admin Service Account credentials
│   ├── package.json               # Backend dependencies and run scripts
│   ├── tsconfig.json              # TypeScript compiler configuration
│   └── src/
│       ├── index.ts               # Express bootstrapper & static server
│       ├── types.ts               # Core TypeScript domain models & interfaces
│       ├── api/
│       │   ├── ai.ts              # Groq AI Shopping & Business endpoints
│       │   ├── auth.ts            # Profile synchronization (/api/auth/sync)
│       │   ├── cart.ts            # Shopping cart management routes
│       │   ├── orders.ts          # Admin order CRUD endpoints
│       │   ├── products.ts        # Instant prefix search, filters, categories
│       │   └── store.ts           # Customer checkout & personal order routes
│       ├── config/
│       │   └── firebase.ts        # Firebase Admin SDK initialization
│       ├── db/
│       │   ├── listener.ts        # PostgreSQL LISTEN/NOTIFY daemon
│       │   ├── migrate.ts         # Schema migrator & trigger installer
│       │   ├── pool.ts            # pg.Pool connection manager
│       │   └── seed.ts            # 528-product catalog generator
│       ├── middleware/
│       │   └── auth.ts            # Bearer JWT cryptographic validation
│       ├── utils/
│       │   ├── email.ts           # Nodemailer transactional email templates
│       │   └── http.ts            # Standardized HTTP error response handlers
│       └── ws/
│           └── server.ts          # WebSocket broadcast server
└── client/
    ├── index.html                 # Storefront (search, filters, cart, 3-step checkout, AI chat)
    └── admin.html                 # Admin portal (isolated auth, live KPIs, AI advisor)
```

---

## 🚀 Local Deployment & Setup Guide

### 1. Prerequisites
- **Node.js**: v18 or higher (`node -v`)
- **Docker & Docker Compose**: For running PostgreSQL 16
- **Groq Cloud Account**: Free API key from [groq.com](https://groq.com)
- **Firebase Project**: Google Sign-In enabled with Web credentials

### 2. Start PostgreSQL Container
```powershell
docker-compose up -d
```
*PostgreSQL container starts on host port `5433` (DB: `apt_orders`, User: `apt_user`, Pass: `apt_pass`).*

### 3. Configure Environment Variables
Inside `backend/.env`:
```env
DB_HOST=127.0.0.1
DB_PORT=5433
DB_NAME=apt_orders
DB_USER=apt_user
DB_PASSWORD=apt_pass

FIREBASE_SERVICE_ACCOUNT_PATH=./firebase-service-key.json

SMTP_USER=your.email@gmail.com
SMTP_PASS=your_google_app_password

FIREBASE_API_KEY=AIzaSy...
FIREBASE_AUTH_DOMAIN=your-app.firebaseapp.com
FIREBASE_PROJECT_ID=your-app

GROQ_API_KEY=gsk_...
```

### 4. Install Dependencies & Build
```powershell
cd backend
npm install
npm run build
```

### 5. Start Backend Server
```powershell
npm run dev
```
*The server boots at `http://localhost:3000`, automatically applies schema migrations, checks catalog seeding (528 products), initializes Firebase Admin, connects to the Groq AI API, and starts listening for PostgreSQL change notifications.*

### 6. Access Applications
- **Storefront**: `http://localhost:3000`
- **Admin Portal**: `http://localhost:3000/admin.html` (Accessible with admin email `skibidi.businessguru@gmail.com`)

---

## ✅ Completed Milestones

- [x] **Zero-Polling Architecture**: PostgreSQL `LISTEN/NOTIFY` + WebSockets.
- [x] **528-Product Scalable Catalog**: 12 categories, multi-facet filtering, instant prefix search.
- [x] **Professional 3-Step Checkout Flow**: Shipping form, payment method selector, coupon engine (`SKIBIDI10`, `WELCOME20`, `CHAD50`, `FREESHIP`), and printable tax invoice (`#INV-2026-XXXX`).
- [x] **Storefront & Admin Session Isolation**: Separate Firebase instances with session persistence.
- [x] **Groq AI Integration**: Grounded shopping assistant ("Skibidi AI") + Admin Business Advisor.
- [x] **Real-Time Order Tracking & SMTP Notifications**: Email dispatch on order creation and status updates.
