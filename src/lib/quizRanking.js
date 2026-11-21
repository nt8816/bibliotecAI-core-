export function projectQuizRanking(data, telao) {
  return telao ? data.map(({ nickname, xp, correct_count, elapsed_ms }) => ({ nickname, xp, correct_count, elapsed_ms })) : data;
}
