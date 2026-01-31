# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a **Community Journalist** web application - an AI-powered interview platform that enables real-time voice conversations between community members and an AI journalist. The platform aggregates insights from interviews to generate community newsletters.

## Tech Stack

- **Framework**: Next.js 16.1.4 with App Router, React 19.2.3, TypeScript 5
- **Database**: PostgreSQL with Prisma ORM (connection pooling enabled)
- **AI/ML**: Anthropic Claude API (conversations), OpenAI API (TTS fallback), VAD for voice detection
- **Styling**: Tailwind CSS 4 with PostCSS

## Common Commands

```bash
npm run dev      # Start development server (localhost:3000)
npm run build    # Build for production (runs prisma generate first)
npm run start    # Start production server
npm run lint     # Run ESLint
```

## Project Structure

```
/src
  /app
    /api
      /admin/           # Admin endpoints (conversations, newsletter, story-assignments)
      /conversation/    # Core interview API (start, end, message with SSE streaming)
      /config           # Public configuration endpoint
    /conversation       # Main voice interview UI
    /admin              # Admin dashboard
  /lib
    /config.ts          # App configuration & system prompt templates
    /db.ts              # Prisma client singleton
    /sentenceBuffer.ts  # TTS streaming sentence chunker
/prisma
  /schema.prisma        # Database models (User, Conversation, Message, etc.)
  /migrations           # Database migration history
```

## Key Architectural Patterns

- **SSE Streaming**: Claude responses stream via Server-Sent Events with sentence buffering for progressive TTS
- **Prisma Singleton**: Database client uses singleton pattern in `/src/lib/db.ts`
- **Dynamic System Prompts**: Built in `/src/lib/config.ts` with user context, story assignments, and persona customization
- **Path Aliases**: Use `@/*` to reference `./src/*`

## Database Models

Core entities: User, Conversation, Message, GeneratedNewsletter, EditorialContext, StoryBacklog, StoryAssignment

Run `npx prisma studio` to browse data, `npx prisma migrate dev` for migrations.

## Environment Variables Required

- `ANTHROPIC_API_KEY` - Claude API key
- `OPENAI_API_KEY` - OpenAI API key (for TTS)
- `POSTGRES_PRISMA_URL` - Pooled database connection
- `POSTGRES_URL_NON_POOLING` - Direct database connection
- `COMMUNITY_NAME` - Community display name (default: "Lincoln Elementary")
- `JOURNALIST_NAME` - AI journalist persona name (default: "Jamie")
- `ADMIN_EMAIL` - Admin authentication email
