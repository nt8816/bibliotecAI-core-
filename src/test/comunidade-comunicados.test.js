import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import {
  canShowCommunityPost,
  isAllowedCommunityPostTipo,
  isExpiredComunicado,
  pickCommunityPostInsertFields,
  resolvePostsSafely,
} from '@/lib/comunidadeGuards';

const ROOT = process.cwd();
const read = (rel) => readFileSync(resolve(ROOT, rel), 'utf8');

describe('comunidade guards', () => {
  it('filters expired comunicados only when expires_at is past', () => {
    expect(isExpiredComunicado({ tipo: 'comunicado', expires_at: null })).toBe(false);
    expect(isExpiredComunicado({ tipo: 'comunicado', expires_at: '2099-01-01T00:00:00Z' })).toBe(false);
    expect(isExpiredComunicado({ tipo: 'comunicado', expires_at: '2000-01-01T00:00:00Z' })).toBe(true);
  });

  it('validates community post tipos', () => {
    expect(isAllowedCommunityPostTipo('comunicado')).toBe(true);
    expect(isAllowedCommunityPostTipo('RESenha')).toBe(true);
    expect(isAllowedCommunityPostTipo('hack')).toBe(false);
    expect(isAllowedCommunityPostTipo('')).toBe(false);
  });

  it('picks only known insert fields from body', () => {
    const payload = pickCommunityPostInsertFields({
      tipo: 'comunicado',
      titulo: 'Aviso',
      conteudo: 'texto',
      tags: ['comunicado'],
      imagem_urls: ['escolas/a/x.jpg'],
      arquivos: [{ path: 'escolas/a/f.pdf' }],
      audio_url: 'escolas/a/a.webm',
      audio_duration_seconds: 12,
      expires_at: null,
      turma_publico: '1A',
      autor_id: 'should-not-pass',
      escola_id: 'should-not-pass',
      unknown_column: 'nope',
    });

    expect(payload).toEqual({
      tipo: 'comunicado',
      titulo: 'Aviso',
      conteudo: 'texto',
      tags: ['comunicado'],
      imagem_urls: ['escolas/a/x.jpg'],
      arquivos: [{ path: 'escolas/a/f.pdf' }],
      audio_url: 'escolas/a/a.webm',
      audio_duration_seconds: 12,
      expires_at: null,
      turma_publico: '1A',
    });
  });

  it('hides posts from other schools for regular students', () => {
    const post = { id: '1', escola_id: 'escola-a', turma_publico: '1A', tipo: 'resenha' };
    expect(canShowCommunityPost({ post, escolaId: 'escola-a', turma: '1A', role: 'aluno' })).toBe(true);
    expect(canShowCommunityPost({ post, escolaId: 'escola-b', turma: '1A', role: 'aluno' })).toBe(false);
    expect(canShowCommunityPost({ post, escolaId: 'escola-b', turma: '1A', role: 'gestor' })).toBe(true);
  });

  it('hides expired posts even if escola matches', () => {
    const post = {
      id: '1',
      escola_id: 'escola-a',
      tipo: 'comunicado',
      expires_at: '2000-01-01T00:00:00Z',
    };
    expect(canShowCommunityPost({ post, escolaId: 'escola-a', role: 'aluno' })).toBe(false);
  });

  it('resolvePostsSafely keeps original posts when media hydration fails', async () => {
    const items = [{ id: 'ok' }, { id: 'bad' }, null];
    const result = await resolvePostsSafely(items, async (item) => {
      if (!item) return null;
      if (item?.id === 'bad') throw new Error('media fail');
      return { ...item, hydrated: true };
    });
    expect(result).toEqual([
      { id: 'ok', hydrated: true },
      { id: 'bad' },
    ]);
  });
});

describe('api-gateway comunidade/comunicados hardening', () => {
  const gateway = read('cloudflare/api-gateway/src/index.ts');

  it('comunidade endpoint degrades livros/likes failures instead of 500', () => {
    const start = gateway.indexOf("'GET /v1/aluno/comunidade'");
    const end = gateway.indexOf("'GET /v1/aluno/painel'");
    const section = gateway.slice(start, end);
    expect(section).toContain("/rest/v1/livros?select=id,titulo&order=titulo.asc').catch(() => [])");
    expect(section).toContain("/rest/v1/comunidade_curtidas?select=post_id,usuario_id').catch(() => [])");
    expect(section).toContain('isExpiredComunicado(item)');
  });

  it('painel endpoint does not die on optional subqueries', () => {
    const start = gateway.indexOf("'GET /v1/aluno/painel'");
    const end = gateway.indexOf("'POST /v1/aluno/wishlist/toggle'");
    const section = gateway.slice(start, end);
    expect(section).toContain("/rest/v1/emprestimos?");
    expect(section.match(/emprestimos\?[\s\S]*?\)\.catch\(\(\) => \[\]\)/)).toBeTruthy();
    expect(section).toContain("/rest/v1/atividades_leitura?");
    expect(section.match(/atividades_leitura\?[\s\S]*?\)\.catch\(\(\) => \[\]\)/)).toBeTruthy();
  });

  it('feed endpoint scopes by escola_id and filters expired posts', () => {
    const start = gateway.indexOf("'GET /v1/aluno/comunidade/feed'");
    const end = gateway.indexOf("'GET /v1/aluno/comunidade/posts/:id'");
    const section = gateway.slice(start, end);
    expect(section).toContain('escola_id: `eq.${escolaId}`');
    expect(section).toContain('isExpiredComunicado(item)');
  });

  it('post by id scopes by escola_id for non-managers', () => {
    const start = gateway.indexOf("'GET /v1/aluno/comunidade/posts/:id'");
    const end = gateway.indexOf("'POST /v1/aluno/comunidade/posts'");
    const section = gateway.slice(start, end);
    expect(section).toContain('escolaId && !canCrossEscola');
    expect(section).toContain('isExpiredComunicado(post)');
  });

  it('create post sanitizes fields and validates tipo', () => {
    const start = gateway.indexOf("'POST /v1/aluno/comunidade/posts'");
    const end = gateway.indexOf("'POST /v1/aluno/comunidade/posts/:id/like'");
    const section = gateway.slice(start, end);
    expect(section).toContain('Tipo de publicacao invalido');
    expect(section).toContain('sanitizedBody');
    expect(section).not.toContain('body: { ...body, autor_id: alunoId');
  });
});

describe('frontend comunidade/comunicados resilience', () => {
  it('Comunicados isolates professor panel failure from comunidade load', () => {
    const source = read('src/pages/Comunicados.jsx');
    expect(source).toContain('Promise.allSettled');
    expect(source).toContain('fetchProfessorPainelData');
    expect(source).toContain("responseResult.status === 'rejected'");
  });

  it('ComunidadeAluno hydrates posts without failing the whole feed', () => {
    const source = read('src/pages/aluno/ComunidadeAluno.jsx');
    expect(source).toContain('resolvePostsSafely');
    expect(source).not.toMatch(/await Promise\.all\(\s*ensureArray\(response\?\.posts\)/);
  });

  it('ComunidadeAluno wraps turmas publication load failures', () => {
    const source = read('src/pages/aluno/ComunidadeAluno.jsx');
    const start = source.indexOf('const loadTurmasPublicacao');
    const end = source.indexOf('const quizRankingFromDate');
    const section = source.slice(start, end);
    expect(section).toContain('try {');
    expect(section).toContain('catch {');
  });
});
