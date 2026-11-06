import { describe, expect, it } from 'vitest';

function calculateQuizLivroXp(history) {
  return Object.values(history || {}).reduce((acc, entry) => {
    return acc + Number(entry?.best?.acertos || 0) * 10;
  }, 0);
}

function pickBestAttempt(attempts) {
  return attempts.reduce((best, current) => (
    !best || Number(current.acertos) > Number(best.acertos) ? current : best
  ), null);
}

function computeRankingXpParts({
  xpLeituras = 0,
  totalAvaliacoes = 0,
  atividadesAprovadas = 0,
  pontosGanhos = 0,
  bonusDesafio = 0,
  quizComunidadeAcertos = 0,
  quizLivroAcertos = 0,
  postsComunidade = 0,
}) {
  return (
    Number(xpLeituras || 0)
    + Number(totalAvaliacoes || 0) * 15
    + Number(atividadesAprovadas || 0) * 25
    + Number(pontosGanhos || 0)
    + Number(bonusDesafio || 0)
    + Number(quizComunidadeAcertos || 0) * 10
    + Number(quizLivroAcertos || 0) * 10
    + Number(postsComunidade || 0) * 20
  );
}

describe('quiz book XP', () => {
  it('counts only best acertos per quiz key at 10 XP each', () => {
    const history = {
      'livro-a::geral': { best: { acertos: 4, total: 5 } },
      'livro-b::interpretacao': { best: { acertos: 2, total: 5 } },
      'livro-a::personagens': { best: { acertos: 5, total: 5 } },
    };
    expect(calculateQuizLivroXp(history)).toBe((4 + 2 + 5) * 10);
  });

  it('returns 0 when history is empty', () => {
    expect(calculateQuizLivroXp({})).toBe(0);
    expect(calculateQuizLivroXp(undefined)).toBe(0);
  });

  it('keeps only the best attempt when replaying a quiz', () => {
    const best = pickBestAttempt([
      { acertos: 2, total: 5 },
      { acertos: 4, total: 5 },
      { acertos: 3, total: 5 },
    ]);
    expect(best.acertos).toBe(4);
  });
});

describe('ranking XP total', () => {
  it('includes book quizzes, community quizzes, posts and other sources', () => {
    const xp = computeRankingXpParts({
      xpLeituras: 18,
      totalAvaliacoes: 1,
      atividadesAprovadas: 1,
      pontosGanhos: 10,
      bonusDesafio: 5,
      quizComunidadeAcertos: 3,
      quizLivroAcertos: 4,
      postsComunidade: 2,
    });
    expect(xp).toBe(18 + 15 + 25 + 10 + 5 + 30 + 40 + 40);
  });

  it('does not break when book quiz history is missing', () => {
    const xp = computeRankingXpParts({
      xpLeituras: 10,
      quizComunidadeAcertos: 1,
    });
    expect(xp).toBe(10 + 10);
  });
});
