WITH ranked_active_plans AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY client_id
      ORDER BY updated_at DESC, created_at DESC, id DESC
    ) AS active_position
  FROM meal_plans
  WHERE status = 'active'
)
UPDATE meal_plans
SET
  status = 'archived',
  version = version + 1,
  updated_at = CURRENT_TIMESTAMP
WHERE id IN (
  SELECT id
  FROM ranked_active_plans
  WHERE active_position > 1
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_meal_plans_single_active_client
ON meal_plans(client_id)
WHERE status = 'active';
