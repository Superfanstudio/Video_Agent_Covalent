// Vercel serverless adapter for all /api/db/* routes. Thin wrapper around the
// shared router; real logic lives in api/_lib/router.js + store.js.

import { handleApi } from '../_lib/router.js'

export default async function handler(req, res) {
  const parts = req.query.path
  const path = Array.isArray(parts) ? parts.join('/') : (parts || '')

  // strip the catch-all param out of the query
  const query = { ...req.query }
  delete query.path

  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim()
    || req.socket?.remoteAddress || null

  const body = (typeof req.body === 'object' && req.body !== null) ? req.body : {}

  const { status, body: out } = await handleApi(
    { method: req.method, path, query, body, ip },
    process.env,
  )
  res.status(status).json(out)
}
