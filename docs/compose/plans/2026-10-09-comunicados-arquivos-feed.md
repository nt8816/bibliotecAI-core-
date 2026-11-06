# Comunicados + Arquivos Feed Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use compose:subagent (recommended) or compose:execute to implement this plan task-by-task.

**Goal:** Redesign Comunicados and Arquivos Didáticos as WhatsApp/Instagram-inspired feeds without new backend.

**Architecture:** Shared community components + rewire two existing pages on current APIs (comunidade_posts tipo=comunicado, arquivos Aula + R2).

**Tech Stack:** React, Tailwind, existing shadcn ui, R2, Platform API.

## Global Constraints
- No push to origin (user: "n suba o commit")
- Keep existing API/services
- Dark mode + mobile first
- Green institutional palette

### Task 1: Community components
Create ChannelTopBar, FeedCardShell, AttachmentList, ImageGrid, ComposerSheet under src/components/community/

### Task 2: Rewire Comunicados.jsx feed + FAB composer
Keep publish/delete/filters logic; new visual shell.

### Task 3: Rewire ArquivosAula.jsx envelope feed + send composer
Keep upload/download/delete; new visual shell.

### Task 4: Tests + build
Helpers + npm test + npm run build:web. Local commit only.
