BEGIN;

CREATE FUNCTION pg_temp.cache_rls_request_calls(expression text)
RETURNS text
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
DECLARE
  position integer := 1;
  token_start integer;
  expression_length integer := length(expression);
  quote_character text;
  current_character text;
  matched_call text[];
  optimized_expression text := '';
BEGIN
  IF expression IS NULL THEN
    RETURN NULL;
  END IF;

  WHILE position <= expression_length LOOP
    current_character := substr(expression, position, 1);

    IF current_character IN ('''', '"') THEN
      quote_character := current_character;
      token_start := position;
      position := position + 1;

      WHILE position <= expression_length LOOP
        IF substr(expression, position, 1) = quote_character THEN
          IF substr(expression, position + 1, 1) = quote_character THEN
            position := position + 2;
          ELSE
            position := position + 1;
            EXIT;
          END IF;
        ELSE
          position := position + 1;
        END IF;
      END LOOP;

      optimized_expression := optimized_expression || substr(expression, token_start, position - token_start);
      CONTINUE;
    END IF;

    matched_call := regexp_match(
      substr(expression, position),
      $pattern$^(auth\.(uid|jwt|role|email)\(\)|current_setting\('request\.[^']+'::text(, (true|false))?\))$pattern$
    );

    IF matched_call IS NOT NULL
       AND (position = 1 OR substr(expression, position - 1, 1) !~ '[[:alnum:]_."]') THEN
      IF optimized_expression ~ '\mSELECT[[:space:]]*$' THEN
        optimized_expression := optimized_expression || matched_call[1];
      ELSE
        optimized_expression := optimized_expression || '(SELECT ' || matched_call[1] || ')';
      END IF;
      position := position + length(matched_call[1]);
    ELSE
      optimized_expression := optimized_expression || current_character;
      position := position + 1;
    END IF;
  END LOOP;

  RETURN optimized_expression;
END;
$$;

DO $$
DECLARE
  target record;
  optimized_qual text;
  optimized_check text;
  policy_statement text;
BEGIN
  FOR target IN
    SELECT schemaname, tablename, policyname, qual, with_check
    FROM pg_policies
    WHERE schemaname IN ('public', 'storage') OR starts_with(schemaname, 'tenant_')
  LOOP
    optimized_qual := pg_temp.cache_rls_request_calls(target.qual);
    optimized_check := pg_temp.cache_rls_request_calls(target.with_check);

    IF optimized_qual IS DISTINCT FROM target.qual OR optimized_check IS DISTINCT FROM target.with_check THEN
      policy_statement := format('ALTER POLICY %I ON %I.%I', target.policyname, target.schemaname, target.tablename);

      IF optimized_qual IS DISTINCT FROM target.qual THEN
        policy_statement := policy_statement || format(' USING (%s)', optimized_qual);
      END IF;

      IF optimized_check IS DISTINCT FROM target.with_check THEN
        policy_statement := policy_statement || format(' WITH CHECK (%s)', optimized_check);
      END IF;

      EXECUTE policy_statement;
    END IF;
  END LOOP;
END;
$$;

DROP FUNCTION pg_temp.cache_rls_request_calls(text);

COMMIT;
