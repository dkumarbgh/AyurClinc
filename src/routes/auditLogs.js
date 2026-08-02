const express = require('express');
const db = require('../db/connection');
const { paginationParams } = require('../utils/helpers');

const router = express.Router();

// GET /api/audit-logs?user_id=&page=&limit=
router.get('/', (req, res) => {
  const { user_id } = req.query;
  const { limit, page, offset } = paginationParams(req.query, 50, 200);

  const conditions = [];
  const params = {};
  if (user_id) { conditions.push('user_id = @user_id'); params.user_id = user_id; }
  const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const total = db.prepare(`SELECT COUNT(*) AS c FROM audit_logs ${whereClause}`).get(params).c;
  const rows = db
    .prepare(`SELECT * FROM audit_logs ${whereClause} ORDER BY id DESC LIMIT @limit OFFSET @offset`)
    .all({ ...params, limit, offset });

  res.json({ data: rows, page, limit, total, totalPages: Math.ceil(total / limit) });
});

module.exports = router;
