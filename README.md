# ADaffiliateMedia — CPA Network Admin Panel
## Setup Guide

---

## 📁 File Structure

```
cpa-network/
├── frontend/
│   ├── login.html      ← Admin login page
│   └── admin.html      ← Full admin dashboard
└── backend/
    ├── server.js       ← Node.js Express API
    ├── package.json
    └── .env.example    ← Copy this to .env and fill in values
```

---

## ⚙️ Step 1 — Backend Setup (Render/Railway)

### Install dependencies
```bash
cd backend
npm install
```

### Configure environment
```bash
cp .env.example .env
# Edit .env with your values:
# - MONGO_URI  → Your MongoDB Atlas connection string
# - JWT_SECRET → Any long random string
# - ADMIN_EMAIL / ADMIN_PASS → Your first admin login
```

### Deploy to Render
1. Push backend folder to a GitHub repo
2. Go to render.com → New Web Service
3. Connect your repo
4. Set environment variables (from .env)
5. Start command: `node server.js`
6. Copy your Render URL (e.g. https://adaffiliate-api.onrender.com)

---

## 🔑 Step 2 — Create First Admin Account

After deploying backend, run once:
```
POST https://your-backend.onrender.com/api/seed
```
(Use browser, Postman, or curl — no auth needed)

This creates your first admin with ADMIN_EMAIL and ADMIN_PASS from .env.

⚠️ Delete or comment out the `/api/seed` route in server.js after use!

---

## 🌐 Step 3 — Frontend Setup (Netlify)

1. Open `frontend/login.html`
2. Find this line and change the URL:
   ```js
   const API_URL = 'https://your-backend.onrender.com';
   ```
3. Deploy both `login.html` and `admin.html` to Netlify
4. Add `_redirects` file in frontend folder:
   ```
   /*    /index.html    200
   ```

---

## 🔐 Login

Go to: `https://your-netlify-site.netlify.app/login.html`

Use the email/password from your .env ADMIN_EMAIL / ADMIN_PASS

---

## 📡 API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /api/auth/login | Admin login |
| GET | /api/admin/dashboard | Dashboard stats |
| GET/POST | /api/admin/affiliates | List/add affiliates |
| GET/POST | /api/admin/offers | List/add offers |
| GET | /api/admin/payments | Payment requests |
| POST | /api/admin/payments/:id/approve | Approve payment |
| GET | /api/admin/tracking | Click tracking |
| GET | /api/admin/reports | Performance reports |
| GET/POST | /api/admin/users | Admin users |
| POST | /api/track/click | Public click tracker |
| GET | /api/health | Health check |

---

## 🛠️ Admin Panel Features

- **Dashboard** — Live metrics, click chart, recent conversions
- **Affiliates** — Add/manage affiliates, status control
- **Offers** — Create CPA offers with payout & daily caps
- **Payments** — Approve/review payment requests
- **Click Tracking** — Live click log with fraud detection
- **Reports** — Performance by affiliate, CSV export
- **User Management** — Add admin users with roles
- **Settings** — Network configuration
