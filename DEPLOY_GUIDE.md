# ADaffiliateMedia — Deploy Guide

## ━━━ STEP 1: MongoDB Atlas Setup ━━━

1. https://cloud.mongodb.com এ যাও
2. বাম পাশে **Network Access** → **Add IP Address** → **Allow Access from Anywhere** (0.0.0.0/0) → Confirm
3. এটা না করলে Render থেকে connect হবে না ⚠️

---

## ━━━ STEP 2: Backend → Render Deploy ━━━

1. GitHub-এ নতুন repo বানাও → `adaff-backend`
2. `backend/` ফোল্ডারের সব ফাইল push করো (server.js, package.json, .gitignore)
   - .env ফাইল push করো না! (gitignore-এ আছে)
3. https://render.com → Sign Up / Login
4. **New** → **Web Service** → GitHub repo connect করো
5. Settings:
   - Name: `adaff-api`
   - Runtime: `Node`
   - Build Command: `npm install`
   - Start Command: `node server.js`
6. **Environment Variables** এ এগুলো add করো:
   ```
   MONGO_URL = mongodb+srv://naomiwolf545_db_user:aZDVUYFaoCuIV9ou@cluster0.semrghc.mongodb.net/adaffiliate?appName=Cluster0
   ADMIN_KEY = adaff@SuperAdmin#2025
   ADMIN_EMAIL = admin@adaff.com
   ADMIN_PASS = Adaff@Admin#2025
   PORT = 3001
   ```
7. **Create Web Service** → Deploy হতে 2-3 মিনিট লাগবে
8. URL পাবে যেমন: `https://adaff-api.onrender.com`

---

## ━━━ STEP 3: Frontend URL Update ━━━

`ADaffiliateMedia.jsx` এর উপরে এই line টা:
```js
const API_BASE = "https://adaff-api.onrender.com/api";
```
এখানে তোমার Render URL বসাও।

---

## ━━━ STEP 4: Frontend → Netlify Deploy ━━━

### Option A: Direct Upload (সহজ)
1. https://netlify.com → Login
2. **Add new site** → **Deploy manually**
3. তোমার React project build করো:
   ```bash
   npm run build
   ```
4. `dist` বা `build` ফোল্ডারটা Netlify-তে drag & drop করো
5. Done! URL পাবে: `https://adaffiliatemedia.netlify.app`

### Option B: GitHub দিয়ে (Auto-deploy)
1. frontend code GitHub-এ push করো
2. Netlify → **Import from Git**
3. Build command: `npm run build`
4. Publish directory: `dist`
5. Deploy

---

## ━━━ STEP 5: Test করো ━━━

Backend test:
```
https://adaff-api.onrender.com/api/admin/overview
Header: x-admin-key: adaff@SuperAdmin#2025
```

Frontend test:
- Register করো একটা worker account
- MongoDB Atlas → Browse Collections → workers collection-এ দেখা যাবে
- Admin login: admin@adaff.com / Adaff@Admin#2025

---

## ━━━ New Admin Credentials ━━━

| | পুরনো | নতুন |
|---|---|---|
| Email | admin@adaff.com | admin@adaff.com |
| Password | admin123 | Adaff@Admin#2025 |
| Admin Key | admin123 | adaff@SuperAdmin#2025 |

---

## ━━━ Postback URL (Workers-দের দেবে) ━━━

```
https://adaff-api.onrender.com/api/postback?worker_id=W00001&offer_id={offer_id}&payout={payout}&status={status}&click_id={click_id}
```

---

## ━━━ Free Tier Limitations ━━━

| Service | Free Limit | Note |
|---------|-----------|------|
| Render | 750 hrs/month | 15 মিনিট idle-এ sleep হয়, first request slow |
| Netlify | 100GB bandwidth | যথেষ্ট |
| MongoDB Atlas | 512MB storage | যথেষ্ট |

Render-এর sleep সমস্যা এড়াতে: https://uptimerobot.com দিয়ে প্রতি 10 মিনিটে ping করো।
