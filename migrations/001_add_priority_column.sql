-- 002_add_priority_column.sql
-- Добавление колонки priority

ALTER TABLE tasks 
ADD COLUMN IF NOT EXISTS priority VARCHAR(20) DEFAULT 'medium';

-- Добавим индекс для priority
CREATE INDEX IF NOT EXISTS idx_tasks_priority ON tasks(priority);

-- Комментарий к колонке
COMMENT ON COLUMN tasks.priority IS 'Task priority: low, medium, high';