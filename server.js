require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const { requireAuth, requireRole } = require('./src/middleware/auth');
const auditLog = require('./src/middleware/audit');
const { startReminderJobs } = require('./src/services/reminderJobs');

const authRoutes = require('./src/routes/auth');
const patientsRoutes = require('./src/routes/patients');
const vaccinesRoutes = require('./src/routes/vaccines');
const therapistsRoutes = require('./src/routes/therapists');
const roomsRoutes = require('./src/routes/rooms');
const appointmentsRoutes = require('./src/routes/appointments');
const feesRoutes = require('./src/routes/fees');
const dashboardRoutes = require('./src/routes/dashboard');
const whatsappRoutes = require('./src/routes/whatsapp');
const swarnaPrashanaRoutes = require('./src/routes/swarnaPrashana');
const usersRoutes = require('./src/routes/users');
const auditLogsRoutes = require('./src/routes/auditLogs');
const settingsRoutes = require('./src/routes/settings');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Static admin dashboard (frontend)
app.use(express.static(path.join(__dirname, 'public')));

// Public routes
app.use('/api/auth', auditLog, authRoutes);
app.get('/api/health', (req, res) => res.json({ status: 'ok', time: new Date().toISOString() }));

// Protected API routes — every mount gets requireAuth + auditLog (which records
// non-GET requests). A few are further restricted by role: fees stays out of
// therapist hands, and user/audit-log administration is admin-only. Finer
// restrictions (e.g. only admins can edit the therapist/room lists, or
// front_desk+admin but not therapist can edit patients) are enforced inside
// the individual route files, since they apply to specific methods rather
// than a whole route group.
app.use('/api/patients', requireAuth, auditLog, patientsRoutes);
app.use('/api/vaccines', requireAuth, auditLog, vaccinesRoutes);
app.use('/api/therapists', requireAuth, auditLog, therapistsRoutes);
app.use('/api/rooms', requireAuth, auditLog, roomsRoutes);
app.use('/api/appointments', requireAuth, auditLog, appointmentsRoutes);
app.use('/api/fees', requireAuth, requireRole('admin', 'front_desk'), auditLog, feesRoutes);
app.use('/api/dashboard', requireAuth, dashboardRoutes);
app.use('/api/whatsapp', requireAuth, auditLog, whatsappRoutes);
app.use('/api/swarna-prashana', requireAuth, auditLog, swarnaPrashanaRoutes);
app.use('/api/users', requireAuth, requireRole('admin'), auditLog, usersRoutes);
app.use('/api/audit-logs', requireAuth, requireRole('admin'), auditLogsRoutes);
app.use('/api/settings', requireAuth, auditLog, settingsRoutes);

// Fallback error handler
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error.' });
});

app.listen(PORT, () => {
  console.log(`Clinic management server running on http://localhost:${PORT}`);
  startReminderJobs();
});
