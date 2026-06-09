// Framework-agnostic router for all /api/db/* endpoints.
// Adapters (Vercel function + Vite middleware) parse the HTTP request into a
// plain object and hand it here; this returns { status, body }.

import { makeStore } from './store.js'
import { embedTexts, embedOne, hasEmbeddingKey } from './embeddings.js'
import { extractText, isSupportedFile } from './extract.js'
import { chunkText } from './chunk.js'

const json = (status, body) => ({ status, body })

export async function handleApi({ method, path, query = {}, body = {}, ip }, env) {
  const store = makeStore(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
  if (!store) {
    return json(503, {
      error: 'supabase_not_configured',
      hint: 'Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY, then run supabase/schema.sql.',
    })
  }

  // path is the part after /api/db, e.g. "conversation", "admin/conversations"
  const route = `${method} ${path}`

  try {
    switch (true) {
      // ---- capture (called by the visitor-facing app) ----
      case route === 'POST conversation': {
        if (!body.client_id) return json(400, { error: 'missing_client_id' })
        const r = await store.createConversation({
          client_id: body.client_id,
          ip,
          avatar_id: body.avatar_id,
          avatar_name: body.avatar_name,
          voice_id: body.voice_id,
          user_agent: body.user_agent,
        })
        return json(200, r)
      }
      case route === 'POST message': {
        if (!body.conversation_id || !body.role || !body.text) {
          return json(400, { error: 'missing_fields' })
        }
        const r = await store.addMessage({
          conversation_id: body.conversation_id,
          role: body.role,
          text: body.text,
          seq: body.seq ?? 0,
        })
        return json(200, r)
      }
      case route === 'POST end': {
        if (!body.conversation_id) return json(400, { error: 'missing_conversation_id' })
        return json(200, await store.endConversation(body.conversation_id))
      }

      // ---- admin: conversations ----
      case route === 'GET admin/conversations':
        return json(200, { conversations: await store.listConversations() })

      case route === 'GET admin/conversation': {
        if (!query.id) return json(400, { error: 'missing_id' })
        return json(200, await store.getConversation(query.id))
      }

      case route === 'DELETE admin/conversation': {
        if (!query.id) return json(400, { error: 'missing_id' })
        return json(200, await store.deleteConversation(query.id))
      }

      case route === 'GET admin/export':
        return json(200, await store.exportAll())

      // ---- admin: knowledge base ----
      case route === 'GET admin/knowledge':
        return json(200, { entries: await store.listKnowledge() })

      case route === 'POST admin/knowledge': {
        if (!body.content) return json(400, { error: 'missing_content' })
        return json(200, await store.createKnowledge({
          title: body.title, content: body.content, enabled: body.enabled,
        }))
      }
      case route === 'PATCH admin/knowledge': {
        if (!query.id) return json(400, { error: 'missing_id' })
        return json(200, await store.updateKnowledge(query.id, body))
      }
      case route === 'DELETE admin/knowledge': {
        if (!query.id) return json(400, { error: 'missing_id' })
        return json(200, await store.deleteKnowledge(query.id))
      }

      // ---- admin: documents (file upload → chunk → embed) ----
      case route === 'POST admin/ingest-file': {
        const { filename, mimetype, dataBase64 } = body
        if (!filename || !dataBase64) return json(400, { error: 'missing_file' })
        if (!isSupportedFile(filename, mimetype)) {
          return json(400, { error: 'unsupported_file', hint: 'Upload .txt, .md, .csv, .pdf, or .docx' })
        }
        if (!hasEmbeddingKey(env)) {
          return json(503, { error: 'missing_openrouter_key', hint: 'Set VITE_OPENROUTER_API_KEY.' })
        }
        const buffer = Buffer.from(dataBase64, 'base64')
        const text = await extractText(buffer, filename, mimetype)
        if (!text.trim()) return json(422, { error: 'no_text_extracted' })
        const pieces = chunkText(text)
        if (!pieces.length) return json(422, { error: 'no_chunks' })
        const vectors = await embedTexts(pieces, env)
        const { id } = await store.createDocument({
          name: filename, mimetype: mimetype || null, char_count: text.length,
        })
        const r = await store.addChunks(id, pieces.map((content, idx) => ({
          content, embedding: vectors[idx], chunk_index: idx,
        })))
        return json(200, { document_id: id, name: filename, chunks: r.chunk_count, chars: text.length })
      }

      case route === 'GET admin/documents':
        return json(200, { documents: await store.listDocuments() })

      case route === 'PATCH admin/document': {
        if (!query.id) return json(400, { error: 'missing_id' })
        return json(200, await store.setDocumentEnabled(query.id, body.enabled))
      }
      case route === 'DELETE admin/document': {
        if (!query.id) return json(400, { error: 'missing_id' })
        return json(200, await store.deleteDocument(query.id))
      }

      case route === 'POST admin/search': {
        if (!body.query) return json(400, { error: 'missing_query' })
        if (!hasEmbeddingKey(env)) {
          return json(503, { error: 'missing_openrouter_key', hint: 'Set VITE_OPENROUTER_API_KEY.' })
        }
        const qv = await embedOne(body.query, env)
        return json(200, { results: await store.searchChunks(qv, body.k || 5) })
      }

      default:
        return json(404, { error: 'not_found', route })
    }
  } catch (err) {
    return json(500, { error: 'db_error', detail: String(err?.message || err) })
  }
}
