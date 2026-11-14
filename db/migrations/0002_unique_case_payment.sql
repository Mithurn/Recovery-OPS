DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM recovery_cases WHERE original_payment_id IS NOT NULL
    GROUP BY original_payment_id HAVING count(*) > 1
  ) THEN
    RAISE NOTICE 'idx_cases_original_payment not created: duplicate original_payment_id rows exist, resolve them manually then re-run';
  ELSE
    CREATE UNIQUE INDEX IF NOT EXISTS idx_cases_original_payment ON recovery_cases (original_payment_id)
      WHERE original_payment_id IS NOT NULL;
  END IF;
END
$$;
