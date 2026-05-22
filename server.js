require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const bcrypt = require("bcryptjs");

const app = express();
app.use(express.json());
app.use(cors({ origin: "*" }));

// ─── MongoDB ──────────────────────────────────────────────────────────────────
mongoose
  .connect(process.env.MONGO_URL)
  .then(() => console.log("✅ MongoDB connected"))
  .catch((err) => { console.error("❌ MongoDB error:", err); process.exit(1); });

// ─── Schemas ──────────────────────────────────────────────────────────────────

const Counter = mongoose.model("Counter", new mongoose.Schema({
  _id: String,
  seq: { type: Number, default: 0 },
}));

async function nextWorkerId() {
  const doc = await Counter.findByIdAndUpdate(
    "worker_id",
    { $inc: { seq: 1 } },
    { new: true, upsert: true }
  );
  return "W" + String(doc.seq).padStart(5, "0");
}

const workerSchema = new mongoose.Schema({
  id:             { type: String, unique: true },
  fullName:       String,
  email:          { type: String, unique: true, lowercase: true, trim: true },
  password:       String,
  address:        String,
  phone:          String,
  country:        String,
  city:           String,
  state:          String,
  zipcode:        String,
  status:         { type: String, enum: ["pending","approved","rejected"], default: "pending" },
  role:           { type: String, default: "worker" },
  balance:        { type: Number, default: 0 },
  totalEarned:    { type: Number, default: 0 },
  leads:          { type: Number, default: 0 },
  paymentMethod:  { type: String, default: "" },
  paymentAccount: { type: String, default: "" },
  createdAt:      { type: Date, default: Date.now },
});
const Worker = mongoose.model("Worker", workerSchema);

const leadSchema = new mongoose.Schema({
  worker_id: String,
  offer_id:  String,
  payout:    Number,
  status:    String,
  click_id:  String,
  time:      { type: Date, default: Date.now },
});
const Lead = mongoose.model("Lead", leadSchema);

const withdrawalSchema = new mongoose.Schema({
  id:         { type: String, unique: true },
  worker_id:  String,
  workerName: String,
  amount:     Number,
  method:     String,
  account:    String,
  status:     { type: String, enum: ["pending","paid"], default: "pending" },
  createdAt:  { type: Date, default: Date.now },
  paidAt:     Date,
});
const Withdrawal = mongoose.model("Withdrawal", withdrawalSchema);

// ─── Admin Middleware ─────────────────────────────────────────────────────────
function adminOnly(req, res, next) {
  const key = req.headers["x-admin-key"];
  if (!key || key !== process.env.ADMIN_KEY) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
}

// ─── AUTH ─────────────────────────────────────────────────────────────────────

// POST /api/auth/register
app.post("/api/auth/register", async (req, res) => {
  try {
    const { fullName, email, password, address, phone, country, city, state, zipcode } = req.body;
    if (!fullName || !email || !password)
      return res.status(400).json({ error: "Full name, email and password are required." });

    const exists = await Worker.findOne({ email: email.toLowerCase().trim() });
    if (exists) return res.status(409).json({ error: "Email already registered." });

    const hashed = await bcrypt.hash(password, 12);
    const id = await nextWorkerId();

    await Worker.create({ id, fullName, email, password: hashed, address, phone, country, city, state, zipcode });
    res.status(201).json({ message: "Registration successful! Awaiting admin approval." });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/auth/login
app.post("/api/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password)
      return res.status(400).json({ error: "Email and password required." });

    // Admin
    if (email === process.env.ADMIN_EMAIL && password === process.env.ADMIN_PASS) {
      return res.json({ role: "admin", email, fullName: "Administrator" });
    }

    const worker = await Worker.findOne({ email: email.toLowerCase().trim() });
    if (!worker) return res.status(401).json({ error: "Invalid credentials." });

    const match = await bcrypt.compare(password, worker.password);
    if (!match) return res.status(401).json({ error: "Invalid credentials." });

    if (worker.status === "pending")
      return res.status(403).json({ error: "Your account is awaiting admin approval." });
    if (worker.status === "rejected")
      return res.status(403).json({ error: "Your account has been rejected." });

    const w = worker.toObject();
    delete w.password;
    res.json(w);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── WORKER ───────────────────────────────────────────────────────────────────

// GET /api/workers/:id
app.get("/api/workers/:id", async (req, res) => {
  try {
    const worker = await Worker.findOne({ id: req.params.id }).select("-password");
    if (!worker) return res.status(404).json({ error: "Worker not found." });
    res.json(worker);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT /api/workers/:id
app.put("/api/workers/:id", async (req, res) => {
  try {
    const allowed = ["fullName","email","address","phone","country","city","state","zipcode","paymentMethod","paymentAccount"];
    const updates = {};
    for (const k of allowed) if (req.body[k] !== undefined) updates[k] = req.body[k];

    const worker = await Worker.findOneAndUpdate({ id: req.params.id }, updates, { new: true }).select("-password");
    if (!worker) return res.status(404).json({ error: "Worker not found." });
    res.json(worker);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/workers/:id/leads
app.get("/api/workers/:id/leads", async (req, res) => {
  try {
    const leads = await Lead.find({ worker_id: req.params.id }).sort({ time: -1 });
    res.json(leads);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/workers/:id/withdrawals
app.get("/api/workers/:id/withdrawals", async (req, res) => {
  try {
    const list = await Withdrawal.find({ worker_id: req.params.id }).sort({ createdAt: -1 });
    res.json(list);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/workers/:id/withdrawals
app.post("/api/workers/:id/withdrawals", async (req, res) => {
  try {
    const { amount, method, account } = req.body;
    const worker = await Worker.findOne({ id: req.params.id });
    if (!worker) return res.status(404).json({ error: "Worker not found." });
    if (!method || !account) return res.status(400).json({ error: "Payment method and account required." });
    const amt = parseFloat(amount);
    if (!amt || amt < 50) return res.status(400).json({ error: "Minimum withdrawal is $50." });
    if (worker.balance < amt) return res.status(400).json({ error: "Insufficient balance." });

    const wd = await Withdrawal.create({
      id: "WD" + Date.now(), worker_id: worker.id, workerName: worker.fullName,
      amount: amt, method, account,
    });
    worker.balance -= amt;
    await worker.save();
    res.status(201).json(wd);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── POSTBACK ─────────────────────────────────────────────────────────────────

// GET /api/postback?worker_id=W00001&offer_id=3&payout=1.0&status=lead&click_id=abc
app.get("/api/postback", async (req, res) => {
  try {
    const { worker_id, offer_id, payout, status, click_id } = req.query;
    if (!worker_id) return res.status(400).json({ error: "worker_id required." });

    const worker = await Worker.findOne({ id: worker_id });
    if (!worker) return res.status(404).json({ error: "Worker not found." });

    const amt = parseFloat(payout) || 0;
    await Lead.create({ worker_id, offer_id: offer_id || "unknown", payout: amt, status: status || "lead", click_id });

    if (status !== "reject") {
      worker.balance     += amt;
      worker.totalEarned += amt;
      worker.leads       += 1;
      await worker.save();
    }
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── ADMIN ────────────────────────────────────────────────────────────────────

// GET /api/admin/overview
app.get("/api/admin/overview", adminOnly, async (req, res) => {
  try {
    const [totalWorkers, activeWorkers, pendingWorkers, rejectedWorkers, totalLeads, pendingWithdrawals, earningsAgg] = await Promise.all([
      Worker.countDocuments(),
      Worker.countDocuments({ status: "approved" }),
      Worker.countDocuments({ status: "pending" }),
      Worker.countDocuments({ status: "rejected" }),
      Lead.countDocuments(),
      Withdrawal.countDocuments({ status: "pending" }),
      Worker.aggregate([{ $group: { _id: null, total: { $sum: "$totalEarned" } } }]),
    ]);
    res.json({
      totalWorkers, activeWorkers, pendingWorkers, rejectedWorkers,
      totalLeads, pendingWithdrawals,
      totalEarnings: earningsAgg[0]?.total || 0,
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/admin/workers?status=pending
app.get("/api/admin/workers", adminOnly, async (req, res) => {
  try {
    const filter = req.query.status ? { status: req.query.status } : {};
    const workers = await Worker.find(filter).select("-password").sort({ createdAt: -1 });
    res.json(workers);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PATCH /api/admin/workers/:id/approve
app.patch("/api/admin/workers/:id/approve", adminOnly, async (req, res) => {
  try {
    const w = await Worker.findOneAndUpdate({ id: req.params.id }, { status: "approved" }, { new: true }).select("-password");
    if (!w) return res.status(404).json({ error: "Worker not found." });
    res.json({ message: `${w.fullName} approved.`, worker: w });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PATCH /api/admin/workers/:id/reject
app.patch("/api/admin/workers/:id/reject", adminOnly, async (req, res) => {
  try {
    const w = await Worker.findOneAndUpdate({ id: req.params.id }, { status: "rejected" }, { new: true }).select("-password");
    if (!w) return res.status(404).json({ error: "Worker not found." });
    res.json({ message: `${w.fullName} rejected.`, worker: w });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/admin/leads
app.get("/api/admin/leads", adminOnly, async (req, res) => {
  try {
    const leads = await Lead.find().sort({ time: -1 }).limit(1000);
    res.json(leads);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/admin/withdrawals?status=pending
app.get("/api/admin/withdrawals", adminOnly, async (req, res) => {
  try {
    const filter = req.query.status ? { status: req.query.status } : {};
    const list = await Withdrawal.find(filter).sort({ createdAt: -1 });
    res.json(list);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PATCH /api/admin/withdrawals/:id/approve
app.patch("/api/admin/withdrawals/:id/approve", adminOnly, async (req, res) => {
  try {
    const wd = await Withdrawal.findOneAndUpdate(
      { id: req.params.id },
      { status: "paid", paidAt: new Date() },
      { new: true }
    );
    if (!wd) return res.status(404).json({ error: "Withdrawal not found." });
    res.json({ message: "Payment approved.", withdrawal: wd });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── Start ────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`🚀 Server on http://localhost:${PORT}`));
