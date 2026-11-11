function getStepLogger(manager) {
    try {
        if (manager && typeof manager.getLogger === "function") {
            return manager.getLogger();
        }
    }
    catch (_error) {
        // Ignore and fall back to console logger.
    }
    return {
        info: function (message) { if (typeof console !== "undefined" && console.log) { console.log(message); } },
        warn: function (message) { if (typeof console !== "undefined" && console.warn) { console.warn(message); } },
        error: function (message) { if (typeof console !== "undefined" && console.error) { console.error(message); } },
        severe: function (message) { if (typeof console !== "undefined" && console.error) { console.error(message); } }
    };
}

/**
 * STEP Business Rule
 * Trademark: AI Labz Ltd (TM)
 * Purpose: Describe the rule intent and expected side effects.
 * Notes: Keep transactions short and avoid repeated writes in loops.
 */


import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import admin from 'firebase-admin';
import { Resend } from 'resend';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import crypto from 'node:crypto';

const app = express();

app.disable('x-powered-by');

app.use(helmet({
  contentSecurityPolicy: false
}));

app.use(express.json({ limit: '20kb' }));

const publicDir = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'public'
);

app.use(express.static(publicDir));

app.use('/api', rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 100,
  standardHeaders: 'draft-7',
  legacyHeaders: false
}));

const {
  FIREBASE_SERVICE_ACCOUNT_JSON,
  FIREBASE_PROJECT_ID,
  FIREBASE_DATABASE_URL,
  ADMIN_UID,
  ADMIN_EMAIL,
  RESEND_API_KEY,
  EMAIL_FROM
} = process.env;

// Firebase Admin initialization

let db;

try {
  if (!FIREBASE_SERVICE_ACCOUNT_JSON) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON missing');
  }

  const credential = JSON.parse(
    FIREBASE_SERVICE_ACCOUNT_JSON
  );

  admin.initializeApp({
    credential: admin.credential.cert(credential),
    databaseURL: FIREBASE_DATABASE_URL,
    projectId: FIREBASE_PROJECT_ID
  });

  db = admin.database();

} catch (err) {
  console.error(
    'Firebase Admin not configured:',
    err.message
  );
}

// Resend Email

const resend = RESEND_API_KEY
  ? new Resend(RESEND_API_KEY)
  : null;

// Services and prices

const services = Object.freeze({
  channels: {
    name: 'Discord Channel Setup',
    price: 20000
  },

  bot: {
    name: 'Custom Discord Bot',
    price: 40000
  },

  website: {
    name: 'Premium Website',
    price: 150000
  },

  design: {
    name: 'Graphic Design',
    price: 25000
  }
});

const statuses = new Set([
  'pending',
  'in_progress',
  'completed',
  'rejected'
]);

const error = (res, status, message) =>
  res.status(status).json({ error: message });

const safeText = (value, max) =>
  typeof value === 'string'
    ? value.trim().slice(0, max)
    : '';

// Verify Firebase ID token

async function authenticate(req, res, next) {
  if (!db) {
    return error(
      res,
      503,
      'Серверийн Firebase тохиргоо дутуу байна.'
    );
  }

  const token = req.headers.authorization
    ?.match(/^Bearer (.+)$/)?.[1];

  if (!token) {
    return error(res, 401, 'Нэвтрэх шаардлагатай.');
  }

  try {
    req.user = await admin.auth().verifyIdToken(
      token,
      true
    );

    next();

  } catch {
    return error(
      res,
      401,
      'Нэвтрэх эрх хүчингүй байна.'
    );
  }
}

// Admin authorization

/**
 * STEP business rule function: isAdmin.
 * TODO: Describe purpose, side effects, and expected node/context state.
 * @param {*} user
 */
function isAdmin(user) {
  return Boolean(ADMIN_UID) &&
    user.uid === ADMIN_UID;
}

/**
 * STEP business rule function: adminOnly.
 * TODO: Describe purpose, side effects, and expected node/context state.
 * @param {*} req
 * @param {*} res
 * @param {*} next
 */
function adminOnly(req, res, next) {
  return isAdmin(req.user)
    ? next()
    : error(res, 403, 'Админ эрхгүй.');
}

// Email service

async function sendEmail(to, subject, body) {
  if (!resend || !EMAIL_FROM) {
    return 'not_configured';
  }

  const result = await resend.emails.send({
    from: EMAIL_FROM,
    to: [to],
    subject,
    text: body
  });

  if (result.error) {
    throw new Error(result.error.message);
  }

  return 'sent';
}

// Order rate limiting

const orderLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 8,
  standardHeaders: 'draft-7',
  legacyHeaders: false
});

// Health check

app.get('/api/health', (_, res) => {
  res.json({
    ok: true,
    firebaseReady: !!db,
    emailReady: !!(resend && EMAIL_FROM)
  });
});

// Current user

app.get('/api/me', authenticate, (req, res) => {
  res.json({
    uid: req.user.uid,
    admin: isAdmin(req.user),
    email: req.user.email || ''
  });
});

// Create order

app.post(
  '/api/orders',
  orderLimiter,
  authenticate,
  async (req, res) => {
    const {
      service,
      discord,
      details
    } = req.body || {};

    if (!services[service]) {
      return error(
        res,
        400,
        'Үйлчилгээ буруу байна.'
      );
    }

    const contact = safeText(discord, 80);
    const description = safeText(details, 2000);

    if (
      contact.length < 2 ||
      description.length < 10
    ) {
      return error(
        res,
        400,
        'Discord болон тайлбараа бүрэн бөглөнө үү.'
      );
    }

    const id = crypto.randomUUID();

    const order = {
      id,
      uid: req.user.uid,
      email: req.user.email || '',
      name: req.user.name || '',
      service,
      serviceName: services[service].name,
      price: services[service].price,
      discord: contact,
      details: description,
      status: 'pending',
      createdAt: Date.now(),
      replies: {}
    };

    try {
      await db.ref(`orders/${id}`).set(order);

      let notification = 'not_configured';

      if (ADMIN_EMAIL) {
        try {
          notification = await sendEmail(
            ADMIN_EMAIL,
            `NEXUS шинэ захиалга: ${order.serviceName}`,
            `ID: ${id}
Хэрэглэгч: ${order.email}
Discord: ${contact}
Үйлчилгээ: ${order.serviceName}
Тайлбар: ${description}`
          );

        } catch (e) {
          console.error(
            'Notification failed:',
            e.message
          );

          notification = 'failed';
        }
      }

      res.status(201).json({
        id,
        notification
      });

    } catch (e) {
      console.error(e);

      error(
        res,
        500,
        'Захиалга хадгалахад алдаа гарлаа.'
      );
    }
  }
);

// Sort orders

function sortOrders(
  snapshot,
  predicate = () => true
) {
  return Object.values(snapshot.val() || {})
    .filter(predicate)
    .sort((a, b) => b.createdAt - a.createdAt);
}

// User order history

app.get(
  '/api/orders',
  authenticate,
  async (req, res) => {
    try {
      const snap = await db.ref('orders')
        .orderByChild('uid')
        .equalTo(req.user.uid)
        .once('value');

      res.json({
        orders: sortOrders(snap)
      });

    } catch {
      error(
        res,
        500,
        'Захиалга уншихад алдаа гарлаа.'
      );
    }
  }
);

// Admin: all orders

app.get(
  '/api/admin/orders',
  authenticate,
  adminOnly,
  async (_, res) => {
    try {
      const snap = await db.ref('orders')
        .once('value');

      res.json({
        orders: sortOrders(snap)
      });

    } catch {
      error(
        res,
        500,
        'Захиалга уншихад алдаа гарлаа.'
      );
    }
  }
);

// Admin: update order status

app.patch(
  '/api/admin/orders/:id',
  authenticate,
  adminOnly,
  async (req, res) => {
    if (!statuses.has(req.body?.status)) {
      return error(
        res,
        400,
        'Төлөв буруу байна.'
      );
    }

    try {
      const ref = db.ref(
        `orders/${req.params.id}`
      );

      if (!(await ref.once('value')).exists()) {
        return error(
          res,
          404,
          'Захиалга олдсонгүй.'
        );
      }

      await ref.update({
        status: req.body.status
      });

      res.json({ ok: true });

    } catch {
      error(
        res,
        500,
        'Төлөв хадгалахад алдаа гарлаа.'
      );
    }
  }
);

// Admin: reply by email

app.post(
  '/api/admin/orders/:id/reply',
  authenticate,
  adminOnly,
  async (req, res) => {
    const message = safeText(
      req.body?.message,
      3000
    );

    if (message.length < 2) {
      return error(
        res,
        400,
        'Хариу бичнэ үү.'
      );
    }

    if (!resend || !EMAIL_FROM) {
      return error(
        res,
        503,
        'Имэйл илгээх тохиргоо дутуу байна.'
      );
    }

    try {
      const ref = db.ref(
        `orders/${req.params.id}`
      );

      const snap = await ref.once('value');

      if (!snap.exists()) {
        return error(
          res,
          404,
          'Захиалга олдсонгүй.'
        );
      }

      const order = snap.val();

      if (!order.email) {
        return error(
          res,
          400,
          'Хэрэглэгчийн имэйл байхгүй.'
        );
      }

      await sendEmail(
        order.email,
        `NEXUS захиалгын хариу — ${order.serviceName}`,
        `Сайн байна уу,

${message}

Захиалгын дугаар: ${order.id}
NEXUS Team`
      );

      await ref.child('replies').push({
        message,
        at: Date.now(),
        emailStatus: 'sent'
      });

      res.json({ ok: true });

    } catch (e) {
      console.error(
        'Reply failed:',
        e.message
      );

      error(
        res,
        500,
        'Имэйл илгээх эсвэл хариу хадгалахад алдаа гарлаа.'
      );
    }
  }
);

// Serve frontend

app.get('*', (_, res) => {
  res.sendFile(
    path.join(publicDir, 'index.html')
  );
});

// Start server

const PORT = Number(process.env.PORT) || 3000;

app.listen(PORT, '0.0.0.0', () => {
  console.log(`NEXUS running on port ${PORT}`);
});
