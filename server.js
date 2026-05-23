// ADaffiliateMedia CPA Network — Backend API
// Node.js + Express + MongoDB + JWT

const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
require('dotenv').config();

const app = express();

// ── MIDDLEWARE ──
app.use(cors({
  origin: [
    'https://adaffiliatemedia.netlify.app',
    'http://localhost:3000',
    'http://127.0.0.1:5500'
  ]
}));
app.use(express.json());

// ── DB CONNECTION ──
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('MongoDB connected'))
  .catch(err => console.error('MongoDB error:', err));

// ── MODELS ──

const UserSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: { type: String, enum: ['admin', 'manager', 'support'], default: 'support' },
  lastLogin: Date,
  status: { type: String, default: 'active' }
}, { timestamps: true });

const AffiliateSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  paymentMethod: String,
  earnings: { type: Number, default: 0 },
  conversions: { type: Number, default: 0 },
  status: { type: String, default: 'pending' }
}, { timestamps: true });

const OfferSchema = new mongoose.Schema({
  name: { type: String, required: true },
  category: String,
  payout: { type: Number, required: true },
  dailyCap: Number,
  status: { type: String, default: 'live' },
  url: String,
  convRate: { type: Number, default: 0 }
}, { timestamps: true });

const ConversionSchema = new mongoose.Schema({
  affiliateId: { type: mongoose.Schema.Types.ObjectId, ref: 'Affiliate' },
  affiliate: String,
  offer: String,
  offerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Offer' },
  payout: Number,
  status: { type: String, default: 'pending' }
}, { timestamps: true });

const ClickSchema = new mongoose.Schema({
  affiliateId: { type: mongoose.Schema.Types.ObjectId, ref: 'Affiliate' },
  affiliate: String,
  offer: String,
  ip: String,
  country: String,
  converted: { type: String, default: 'no' },
  isFraud: { type: Boolean, default: false }
}, { timestamps: true });

const PaymentSchema = new mongoose.Schema({
  affiliateId: { type: mongoose.Schema.Types.ObjectId, ref: 'Affiliate' },
  affiliate: String,
  amount: Number,
  method: String,
  status: { type: String, default: 'pending' }
}, { timestamps: true });

const User       = mongoose.model('User', UserSchema);
const Affiliate  = mongoose.model('Affiliate', AffiliateSchema);
const Offer      = mongoose.model('Offer', OfferSchema);
const Conversion = mongoose.model('Conversion', ConversionSchema);
const Click      = mongoose.model('Click', ClickSchema);
const Payment    = mongoose.model('Payment', PaymentSchema);

// ── JWT MIDDLEWARE ──
const authMiddleware = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ message: 'No token provided' });
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ message: 'Invalid or expired token' });
  }
};

// ── AUTH ROUTES ──

// POST /api/auth/login
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user) return res.status(401).json({ message: 'Invalid credentials' });

    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(401).json({ message: 'Invalid credentials' });

    user.lastLogin = new Date();
    await user.save();

    const token = jwt.sign(
      { id: user._id, role: user.role, name: user.name },
      process.env.JWT_SECRET,
      { expiresIn: '12h' }
    );

    res.json({
      token,
      user: { id: user._id, name: user.name, email: user.email, role: user.role }
    });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// ── DASHBOARD ──

// GET /api/admin/dashboard
app.get('/api/admin/dashboard', authMiddleware, async (req, res) => {
  try {
    const today = new Date(); today.setHours(0,0,0,0);
    const month = new Date(); month.setDate(1); month.setHours(0,0,0,0);

    const [totalAffiliates, activeOffers, clicksToday, revenueAgg, recentConversions] = await Promise.all([
      Affiliate.countDocuments(),
      Offer.countDocuments({ status: 'live' }),
      Click.countDocuments({ createdAt: { $gte: today } }),
      Conversion.aggregate([
        { $match: { createdAt: { $gte: month }, status: 'approved' } },
        { $group: { _id: null, total: { $sum: '$payout' } } }
      ]),
      Conversion.find().sort({ createdAt: -1 }).limit(10)
    ]);

    res.json({
      totalAffiliates,
      activeOffers,
      clicksToday,
      revenueMonth: revenueAgg[0]?.total || 0,
      recentConversions: recentConversions.map(c => ({
        affiliate: c.affiliate,
        offer: c.offer,
        payout: c.payout,
        time: timeAgo(c.createdAt),
        status: c.status
      }))
    });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// ── AFFILIATES ──

// GET /api/admin/affiliates
app.get('/api/admin/affiliates', authMiddleware, async (req, res) => {
  try {
    const affiliates = await Affiliate.find().select('-password').sort({ createdAt: -1 });
    res.json({ affiliates });
  } catch { res.status(500).json({ message: 'Server error' }); }
});

// POST /api/admin/affiliates
app.post('/api/admin/affiliates', authMiddleware, async (req, res) => {
  try {
    const { name, email, password, paymentMethod } = req.body;
    const hashed = await bcrypt.hash(password, 10);
    const affiliate = await Affiliate.create({ name, email, password: hashed, paymentMethod });
    res.json({ affiliate: { ...affiliate.toObject(), password: undefined } });
  } catch (err) {
    res.status(400).json({ message: err.code === 11000 ? 'Email already exists' : 'Error creating affiliate' });
  }
});

// PATCH /api/admin/affiliates/:id/status
app.patch('/api/admin/affiliates/:id/status', authMiddleware, async (req, res) => {
  try {
    const affiliate = await Affiliate.findByIdAndUpdate(req.params.id, { status: req.body.status }, { new: true });
    res.json({ affiliate });
  } catch { res.status(500).json({ message: 'Server error' }); }
});

// ── OFFERS ──

// GET /api/admin/offers
app.get('/api/admin/offers', authMiddleware, async (req, res) => {
  try {
    const offers = await Offer.find().sort({ createdAt: -1 });
    res.json({ offers });
  } catch { res.status(500).json({ message: 'Server error' }); }
});

// POST /api/admin/offers
app.post('/api/admin/offers', authMiddleware, async (req, res) => {
  try {
    const offer = await Offer.create(req.body);
    res.json({ offer });
  } catch { res.status(500).json({ message: 'Server error' }); }
});

// PATCH /api/admin/offers/:id
app.patch('/api/admin/offers/:id', authMiddleware, async (req, res) => {
  try {
    const offer = await Offer.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.json({ offer });
  } catch { res.status(500).json({ message: 'Server error' }); }
});

// ── PAYMENTS ──

// GET /api/admin/payments
app.get('/api/admin/payments', authMiddleware, async (req, res) => {
  try {
    const [requests, pendingAgg, paidAgg, disputedAgg] = await Promise.all([
      Payment.find().sort({ createdAt: -1 }),
      Payment.aggregate([{ $match:{ status:'pending' } },{ $group:{ _id:null, total:{ $sum:'$amount' } } }]),
      Payment.aggregate([{ $match:{ status:'paid' } },{ $group:{ _id:null, total:{ $sum:'$amount' } } }]),
      Payment.aggregate([{ $match:{ status:'disputed' } },{ $group:{ _id:null, total:{ $sum:'$amount' } } }]),
    ]);
    res.json({
      requests: requests.map(p => ({ ...p.toObject(), date: p.createdAt.toLocaleDateString('en-US',{month:'short',day:'numeric'}) })),
      pendingTotal: pendingAgg[0]?.total || 0,
      paidMonth: paidAgg[0]?.total || 0,
      disputed: disputedAgg[0]?.total || 0
    });
  } catch { res.status(500).json({ message: 'Server error' }); }
});

// POST /api/admin/payments/:id/approve
app.post('/api/admin/payments/:id/approve', authMiddleware, async (req, res) => {
  try {
    const payment = await Payment.findByIdAndUpdate(req.params.id, { status: 'paid' }, { new: true });
    res.json({ payment });
  } catch { res.status(500).json({ message: 'Server error' }); }
});

// ── TRACKING ──

// GET /api/admin/tracking
app.get('/api/admin/tracking', authMiddleware, async (req, res) => {
  try {
    const today = new Date(); today.setHours(0,0,0,0);
    const [clicksToday, conversions, fraudClicks, clickLog] = await Promise.all([
      Click.countDocuments({ createdAt: { $gte: today } }),
      Click.countDocuments({ createdAt: { $gte: today }, converted: 'yes' }),
      Click.countDocuments({ isFraud: true }),
      Click.find().sort({ createdAt: -1 }).limit(50)
    ]);
    const convRate = clicksToday ? ((conversions / clicksToday) * 100).toFixed(2) : 0;
    res.json({
      clicksToday, conversions, convRate, fraudClicks,
      clickLog: clickLog.map(c => ({
        time: c.createdAt.toTimeString().slice(0,8),
        affiliate: c.affiliate, offer: c.offer,
        ip: c.ip, country: c.country, converted: c.converted
      }))
    });
  } catch { res.status(500).json({ message: 'Server error' }); }
});

// Public click tracking endpoint (called by affiliate links)
app.post('/api/track/click', async (req, res) => {
  try {
    const { affiliateId, offerId, ip, country } = req.body;
    const [affiliate, offer] = await Promise.all([
      Affiliate.findById(affiliateId),
      Offer.findById(offerId)
    ]);
    if (!affiliate || !offer) return res.status(404).json({ message: 'Not found' });

    // Simple fraud check — duplicate IP in last 1h
    const recent = await Click.findOne({ ip, affiliateId, createdAt: { $gte: new Date(Date.now()-3600000) } });
    const isFraud = !!recent;

    await Click.create({ affiliateId, affiliate: affiliate.name, offer: offer.name, ip, country, isFraud });
    res.json({ success: true, redirect: offer.url });
  } catch { res.status(500).json({ message: 'Server error' }); }
});

// ── REPORTS ──

// GET /api/admin/reports
app.get('/api/admin/reports', authMiddleware, async (req, res) => {
  try {
    const report = await Conversion.aggregate([
      { $match: { status: 'approved' } },
      { $group: {
        _id: '$affiliate',
        revenue: { $sum: '$payout' },
        conversions: { $sum: 1 }
      }},
      { $sort: { revenue: -1 } }
    ]);

    const clickCounts = await Click.aggregate([
      { $group: { _id: '$affiliate', clicks: { $sum: 1 } } }
    ]);
    const clickMap = {};
    clickCounts.forEach(c => clickMap[c._id] = c.clicks);

    res.json({
      report: report.map(r => ({
        affiliate: r._id,
        revenue: r.revenue,
        conversions: r.conversions,
        clicks: clickMap[r._id] || 0,
        rate: clickMap[r._id] ? ((r.conversions / clickMap[r._id]) * 100).toFixed(1) : '0.0',
        epc: clickMap[r._id] ? (r.revenue / clickMap[r._id]).toFixed(2) : '0.00'
      }))
    });
  } catch { res.status(500).json({ message: 'Server error' }); }
});

// ── USERS (Admin) ──

// GET /api/admin/users
app.get('/api/admin/users', authMiddleware, async (req, res) => {
  try {
    const users = await User.find().select('-password');
    res.json({
      users: users.map(u => ({
        ...u.toObject(),
        lastLogin: u.lastLogin ? timeAgo(u.lastLogin) : 'Never'
      }))
    });
  } catch { res.status(500).json({ message: 'Server error' }); }
});

// POST /api/admin/users
app.post('/api/admin/users', authMiddleware, async (req, res) => {
  try {
    const { name, email, password, role } = req.body;
    const hashed = await bcrypt.hash(password, 10);
    const user = await User.create({ name, email, password: hashed, role });
    res.json({ user: { ...user.toObject(), password: undefined } });
  } catch (err) {
    res.status(400).json({ message: err.code === 11000 ? 'Email already exists' : 'Error creating user' });
  }
});

// ── SEED FIRST ADMIN ──
// Run once: POST /api/seed
app.post('/api/seed', async (req, res) => {
  try {
    const exists = await User.findOne({ role: 'admin' });
    if (exists) return res.json({ message: 'Admin already exists' });
    const hashed = await bcrypt.hash(process.env.ADMIN_PASS || 'Admin@1234', 10);
    await User.create({
      name: 'Super Admin',
      email: process.env.ADMIN_EMAIL || 'admin@adaffiliate.com',
      password: hashed,
      role: 'admin'
    });
    res.json({ message: 'Admin created! Delete this route after use.' });
  } catch { res.status(500).json({ message: 'Error' }); }
});

// ── HELPERS ──
function timeAgo(date) {
  const diff = Math.floor((Date.now() - new Date(date)) / 1000);
  if (diff < 60) return diff+'s ago';
  if (diff < 3600) return Math.floor(diff/60)+'m ago';
  if (diff < 86400) return Math.floor(diff/3600)+'h ago';
  return Math.floor(diff/86400)+'d ago';
}

// Health check
app.get('/api/health', (req, res) => res.json({ status: 'ok', time: new Date() }));

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
