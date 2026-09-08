const express = require('express');
const pool = require('./db');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 8080;

// Health check — полезно для Cloud Run и для быстрой проверки, что БД доступна
app.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok' });
  } catch (err) {
    console.error('Health check failed:', err);
    res.status(500).json({ status: 'error', message: err.message });
  }
});

// Список задач
app.get('/tasks', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT id, title, done, created_at FROM tasks ORDER BY id DESC'
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal error' });
  }
});

// Одна задача
app.get('/tasks/:id', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM tasks WHERE id = $1', [
      req.params.id,
    ]);
    if (rows.length === 0) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal error' });
  }
});

// Создать задачу
app.post('/tasks', async (req, res) => {
  const { title } = req.body;
  if (!title) return res.status(400).json({ error: 'title is required' });
  try {
    const { rows } = await pool.query(
      'INSERT INTO tasks (title, done) VALUES ($1, false) RETURNING *',
      [title]
    );

    await axios.post( process.env.NOTIFICATION_SERVICE_URL + '/notifications/task-created',
   {
    taskId: result.rows[0].id,
    taskTitle: result.rows[0].title,
    assignedTo: result.rows[0].assigned_to,
    taskUrl: `${process.env.TASK_SERVICE_URL}/tasks/${result.rows[0].id}`
   }
);

    res.status(201).json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal error' });
  }
});

// Обновить задачу
app.put('/tasks/:id', async (req, res) => {
  const { title, done } = req.body;
  try {
    const { rows } = await pool.query(
      `UPDATE tasks SET
         title = COALESCE($1, title),
         done = COALESCE($2, done)
       WHERE id = $3
       RETURNING *`,
      [title, done, req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal error' });
  }
});

// Удалить задачу
app.delete('/tasks/:id', async (req, res) => {
  try {
    const { rowCount } = await pool.query('DELETE FROM tasks WHERE id = $1', [
      req.params.id,
    ]);
    if (rowCount === 0) return res.status(404).json({ error: 'Not found' });
    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal error' });
  }
});

app.listen(PORT, () => {
  console.log(`API запущен на порту ${PORT}`);
});
