export function projectQuizRanking(data, telao) {
  return telao ? data.map(({ xp, correct_count, elapsed_ms }) => ({ xp, correct_count, elapsed_ms })) : data;
}
