// Shared Supabase data layer (server-side only — uses the SERVICE ROLE key).
// Consumed by both the Vercel function (api/db/[...path].js) and the Vite dev
// middleware (vite.config.js). Never import this into client code.

import { createClient } from '@supabase/supabase-js'

export function makeStore(url, serviceKey) {
  if (!url || !serviceKey) return null
  const db = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  return {
    // ---- capture ----
    async createConversation({ client_id, ip, avatar_id, avatar_name, voice_id, user_agent }) {
      const { data, error } = await db
        .from('conversations')
        .insert({ client_id, ip, avatar_id, avatar_name, voice_id, user_agent })
        .select('id')
        .single()
      if (error) throw error
      return { id: data.id }
    },

    async addMessage({ conversation_id, role, text, seq }) {
      const { error } = await db
        .from('messages')
        .insert({ conversation_id, role, text, seq })
      if (error) throw error
      // keep a denormalized count for the admin list
      const { count } = await db
        .from('messages')
        .select('id', { count: 'exact', head: true })
        .eq('conversation_id', conversation_id)
      if (typeof count === 'number') {
        await db.from('conversations').update({ message_count: count }).eq('id', conversation_id)
      }
      return { ok: true }
    },

    async endConversation(id) {
      const { error } = await db
        .from('conversations')
        .update({ ended_at: new Date().toISOString() })
        .eq('id', id)
      if (error) throw error
      return { ok: true }
    },

    // ---- admin: conversations ----
    async listConversations() {
      const { data, error } = await db
        .from('conversations')
        .select('*')
        .order('started_at', { ascending: false })
        .limit(500)
      if (error) throw error
      return data
    },

    async getConversation(id) {
      const { data: conv, error: e1 } = await db
        .from('conversations').select('*').eq('id', id).single()
      if (e1) throw e1
      const { data: messages, error: e2 } = await db
        .from('messages').select('*').eq('conversation_id', id).order('seq', { ascending: true })
      if (e2) throw e2
      return { ...conv, messages }
    },

    async deleteConversation(id) {
      const { error } = await db.from('conversations').delete().eq('id', id)
      if (error) throw error
      return { ok: true }
    },

    async exportAll() {
      const conversations = await this.listConversations()
      const { data: messages, error } = await db
        .from('messages').select('*').order('created_at', { ascending: true })
      if (error) throw error
      const byConv = {}
      for (const m of messages) (byConv[m.conversation_id] ||= []).push(m)
      return {
        exported_at: new Date().toISOString(),
        conversation_count: conversations.length,
        conversations: conversations.map(c => ({ ...c, messages: byConv[c.id] || [] })),
      }
    },

    // ---- admin: knowledge base ----
    async listKnowledge() {
      const { data, error } = await db
        .from('knowledge_entries').select('*').order('created_at', { ascending: false })
      if (error) throw error
      return data
    },

    async createKnowledge({ title, content, enabled = true }) {
      const { data, error } = await db
        .from('knowledge_entries')
        .insert({ title: title || null, content, enabled })
        .select('*').single()
      if (error) throw error
      return data
    },

    async updateKnowledge(id, patch) {
      const { data, error } = await db
        .from('knowledge_entries')
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq('id', id).select('*').single()
      if (error) throw error
      return data
    },

    async deleteKnowledge(id) {
      const { error } = await db.from('knowledge_entries').delete().eq('id', id)
      if (error) throw error
      return { ok: true }
    },

    // ---- documents (uploaded files → chunks + embeddings) ----
    async createDocument({ name, mimetype, char_count }) {
      const { data, error } = await db
        .from('documents')
        .insert({ name, mimetype, char_count })
        .select('id').single()
      if (error) throw error
      return { id: data.id }
    },

    async addChunks(document_id, chunks) {
      const rows = chunks.map((c, idx) => ({
        document_id, chunk_index: idx, content: c.content, embedding: c.embedding,
      }))
      // insert in batches to keep payloads reasonable
      for (let i = 0; i < rows.length; i += 100) {
        const { error } = await db.from('document_chunks').insert(rows.slice(i, i + 100))
        if (error) throw error
      }
      await db.from('documents').update({ chunk_count: rows.length }).eq('id', document_id)
      return { ok: true, chunk_count: rows.length }
    },

    async listDocuments() {
      const { data, error } = await db
        .from('documents').select('*').order('created_at', { ascending: false })
      if (error) throw error
      return data
    },

    async deleteDocument(id) {
      const { error } = await db.from('documents').delete().eq('id', id)
      if (error) throw error
      return { ok: true }
    },

    async setDocumentEnabled(id, enabled) {
      const { data, error } = await db
        .from('documents').update({ enabled }).eq('id', id).select('*').single()
      if (error) throw error
      return data
    },

    // Concatenated text of enabled documents, capped to `cap` chars for the context.
    async enabledDocumentText(cap = 6000) {
      const { data: docs, error: e1 } = await db
        .from('documents').select('id, name').eq('enabled', true)
      if (e1 || !docs?.length) return ''
      const ids = docs.map(d => d.id)
      const { data: chunks, error: e2 } = await db
        .from('document_chunks').select('document_id, chunk_index, content')
        .in('document_id', ids).order('chunk_index', { ascending: true })
      if (e2 || !chunks?.length) return ''
      const nameById = Object.fromEntries(docs.map(d => [d.id, d.name]))
      let out = '', current = null
      for (const c of chunks) {
        const header = nameById[c.document_id] !== current
          ? `\n[${nameById[c.document_id]}]\n` : ''
        if (header) current = nameById[c.document_id]
        const next = header + c.content + '\n'
        if (out.length + next.length > cap) break
        out += next
      }
      return out.trim()
    },

    // Semantic search across enabled document chunks (cosine, computed in JS).
    async searchChunks(queryEmbedding, k = 5) {
      const { cosine } = await import('./embeddings.js')
      const { data: docs } = await db
        .from('documents').select('id, name').eq('enabled', true)
      if (!docs?.length) return []
      const ids = docs.map(d => d.id)
      const nameById = Object.fromEntries(docs.map(d => [d.id, d.name]))
      const { data: chunks, error } = await db
        .from('document_chunks').select('document_id, chunk_index, content, embedding')
        .in('document_id', ids)
      if (error || !chunks?.length) return []
      return chunks
        .filter(c => Array.isArray(c.embedding))
        .map(c => ({
          content: c.content,
          document_name: nameById[c.document_id],
          chunk_index: c.chunk_index,
          score: cosine(queryEmbedding, c.embedding),
        }))
        .sort((a, b) => b.score - a.score)
        .slice(0, k)
    },

    // ---- used by token minting to enrich the avatar context ----
    async enabledKnowledgeText() {
      const { data, error } = await db
        .from('knowledge_entries')
        .select('title, content')
        .eq('enabled', true)
        .order('created_at', { ascending: true })
      if (error || !data?.length) return ''
      return data
        .map(e => (e.title ? `- ${e.title}: ${e.content}` : `- ${e.content}`))
        .join('\n')
    },
  }
}
