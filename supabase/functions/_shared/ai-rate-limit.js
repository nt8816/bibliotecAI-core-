// Only an explicit successful database response may authorize a request.
export async function checkAiRateLimit(client, key, limit, windowSeconds) {
  try {
    const { data, error } = await client.rpc('check_ai_rate_limit', {
      _key: key,
      _limit: limit,
      _window_seconds: windowSeconds,
    }).single();
    return !error && data === true;
  } catch {
    return false;
  }
}
