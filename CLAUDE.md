# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# UIGen — Claude Code Instructions

## Project Overview
AI-powered React component generator with live preview. Users describe components in chat; Claude generates them via a virtual file system shown in a Monaco editor with live iframe preview.

## Commands
```bash
npm run dev           # Dev server (Turbopack)
npm run dev:daemon    # Dev server in background (logs to logs.txt)
npm run build         # Production build
npm run test          # Vitest tests (all)
npm run lint          # ESLint
npm run setup         # Install + Prisma generate + migrate
npm run db:reset      # Reset SQLite database
```

Run a single test file or by name pattern:
```bash
npx vitest run src/lib/__tests__/file-system.test.ts
npx vitest run -t "createFile"
```

## Stack
- **Next.js 15** (App Router) + **React 19** + **TypeScript**
- **Tailwind CSS v4** — use utility classes, never hardcoded styles
- **Prisma + SQLite** — `prisma/schema.prisma`, DB at `prisma/dev.db`
- **Anthropic Claude** via Vercel AI SDK (`@ai-sdk/anthropic`, `ai`) — model: `claude-haiku-4-5`
- **Monaco Editor** for code display/editing
- **JWT (jose) + bcrypt** for auth

## Architecture

### Virtual File System (CRITICAL)
- All generated files live **in-memory only** — `src/lib/file-system.ts`
- **Never write generated code to disk.** Use `VirtualFileSystem` methods only.
- Serialized to JSON for DB persistence (`fileSystem.serialize()` / `deserializeFromNodes()`)

### AI Chat Pipeline
```
POST /api/chat → streamText (Claude or Mock) → tools → VirtualFileSystem → PreviewFrame
```
- Route: `src/app/api/chat/route.ts`
- Tools: `str_replace_editor`, `file_manager` (in `src/lib/tools/`)
- System prompt: `src/lib/prompts/generation.tsx`
- `maxSteps: 40` (real) or `4` (mock fallback when no API key)

### Auth
- JWT sessions via `src/lib/auth.ts` — `getSession()` returns `SessionPayload | null`
- Cookies: httpOnly, 7-day expiry
- **Always check `getSession()` before any DB write**
- Anonymous users can work without signing in; projects saved only for authenticated users

### Preview Rendering
- `PreviewFrame` collects all `.jsx/.ts/.tsx` files from context, Babel-transforms each to JS, creates blob URLs, builds an ESM import map, and sets `iframe.srcdoc`
- Local imports (`@/` alias) and third-party packages (via `esm.sh` CDN) are resolved in `src/lib/transform/jsx-transformer.ts`
- Missing local imports get auto-generated placeholder React components to prevent preview crashes
- Entry point search order: `/App.jsx` → `/App.tsx` → `/index.jsx` → `/index.tsx` → first `.jsx/.tsx`

### Server Actions
- Auth: `signUp`, `signIn`, `signOut`, `getUser` — `src/actions/index.ts`
- Projects: `createProject`, `getProject`, `getProjects` — `src/actions/`
- All DB-writing actions must call `getSession()` first

### React Contexts
- `src/lib/contexts/file-system-context.tsx` — owns the `VirtualFileSystem` instance; exposes CRUD + `refreshTrigger` that PreviewFrame watches
- `src/lib/contexts/chat-context.tsx` — manages messages, streaming state, project identity

### Mock Fallback
- No `ANTHROPIC_API_KEY` → `src/lib/provider.ts` returns a mock model
- Mock generates a demo component in 4 steps — used for local dev without an API key

## Key File Locations
| Purpose | Path |
|---|---|
| Chat API route | `src/app/api/chat/route.ts` |
| Virtual FS | `src/lib/file-system.ts` |
| Auth utilities | `src/lib/auth.ts` |
| AI model provider | `src/lib/provider.ts` |
| Generation system prompt | `src/lib/prompts/generation.tsx` |
| AI tools | `src/lib/tools/` |
| Preview iframe | `src/components/preview/` |
| Code editor | `src/components/editor/` |
| JSX transform + import map | `src/lib/transform/jsx-transformer.ts` |
| React contexts (FS + Chat) | `src/lib/contexts/` |
| Server actions (auth + projects) | `src/actions/` |
| Next.js middleware | `src/middleware.ts` |
| Prisma schema | `prisma/schema.prisma` |

## Generation Rules (system prompt summary)
- Every project **must** have `/App.jsx` as the entry point with a default export
- Import non-library files with `@/` alias (e.g., `@/components/Button`)
- Use Tailwind for all styling — no hardcoded styles, no HTML files
- Keep AI responses brief; don't summarize work unless asked

## DB Schema (SQLite)
- `User`: id, email, password, createdAt
- `Project`: id, name, userId (nullable), messages (JSON string), data (JSON string), createdAt

## Rules
- Do not write generated component files to disk — virtual FS only
- Do not skip `getSession()` checks before DB operations
- Do not change `maxDuration` (120s) — generation can be slow
- Tailwind v4 syntax — check v4 docs if utilities behave unexpectedly
