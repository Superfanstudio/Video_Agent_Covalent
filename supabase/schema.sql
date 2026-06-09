-- Covalent Medical — Avatar conversation capture + knowledge base
-- Run this once in the Supabase SQL Editor (Dashboard → SQL → New query → paste → Run).
--
-- All writes/reads happen server-side with the SERVICE ROLE key (Vite middleware /
-- Vercel functions), so we enable RLS with NO public policies: the anon/public key
-- cannot touch these tables, only the trusted server can.

-- ---------------------------------------------------------------------------
-- Conversations: one row per avatar session, keyed by a unique client_id.
-- ---------------------------------------------------------------------------
create table if not exists public.conversations (
  id           uuid primary key default gen_random_uuid(),
  client_id    text not null,                 -- persistent unique id (device/system), from the browser
  ip           text,                          -- captured server-side
  avatar_id    text,
  avatar_name  text,
  voice_id     text,
  user_agent   text,
  started_at   timestamptz not null default now(),
  ended_at     timestamptz,
  message_count integer not null default 0
);

create index if not exists conversations_client_id_idx on public.conversations (client_id);
create index if not exists conversations_started_at_idx on public.conversations (started_at desc);

-- ---------------------------------------------------------------------------
-- Messages: every finalized transcript line (user + advisor) for a conversation.
-- ---------------------------------------------------------------------------
create table if not exists public.messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  role            text not null check (role in ('user', 'avatar')),
  text            text not null,
  seq             integer not null default 0,
  created_at      timestamptz not null default now()
);

create index if not exists messages_conversation_idx on public.messages (conversation_id, seq);

-- ---------------------------------------------------------------------------
-- Knowledge entries: admin-ingested snippets merged into the avatar's context.
-- ---------------------------------------------------------------------------
create table if not exists public.knowledge_entries (
  id          uuid primary key default gen_random_uuid(),
  title       text,
  content     text not null,
  enabled     boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists knowledge_enabled_idx on public.knowledge_entries (enabled);

-- ---------------------------------------------------------------------------
-- Documents: uploaded txt/pdf/docx files ingested into the knowledge base.
-- ---------------------------------------------------------------------------
create table if not exists public.documents (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  mimetype    text,
  char_count  integer not null default 0,
  chunk_count integer not null default 0,
  enabled     boolean not null default true,
  created_at  timestamptz not null default now()
);

-- Document chunks + their embedding vectors (stored as jsonb float arrays;
-- cosine similarity is computed server-side — no pgvector extension required).
create table if not exists public.document_chunks (
  id           uuid primary key default gen_random_uuid(),
  document_id  uuid not null references public.documents (id) on delete cascade,
  chunk_index  integer not null default 0,
  content      text not null,
  embedding    jsonb,
  created_at   timestamptz not null default now()
);

create index if not exists document_chunks_doc_idx on public.document_chunks (document_id, chunk_index);

-- ---------------------------------------------------------------------------
-- Lock everything down to the service role.
-- ---------------------------------------------------------------------------
alter table public.documents       enable row level security;
alter table public.document_chunks enable row level security;
alter table public.conversations     enable row level security;
alter table public.messages          enable row level security;
alter table public.knowledge_entries enable row level security;
-- (No policies created on purpose — only the service_role key, which bypasses RLS,
--  may read/write. The public anon key is denied.)
