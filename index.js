const express = require('express');
const pool = require('./db');
const { logInfo, logError } = require('./logger');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 8080;

// Логируем каждый входящий запрос — удобно потом искать в Cloud Logging
app.use((req, res, next) => {
  res.on('finish', () => {
    logInfo('request completed', {
      method: req.method,
      path: req.path,
      status: res.statusCode,
    });
  });
  next();
});

// Health check — полезно для Cloud Run и для быстрой проверки, что БД доступна
app.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok' });
  } catch (err) {
    logError('health check failed', err);
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
    logError('failed to list tasks', err);
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
    logError('failed to get task', err, { taskId: req.params.id });
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
    res.status(201).json(rows[0]);
  } catch (err) {
    logError('failed to create task', err);
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
    logError('failed to update task', err, { taskId: req.params.id });
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
    logError('failed to delete task', err, { taskId: req.params.id });
    res.status(500).json({ error: 'Internal error' });
  }
});

app.get('/debug-error', (req, res) => {
  const fakeErr = new Error('Test error for alert verification');
  logError('debug error triggered manually', fakeErr, { triggeredBy: 'manual-test' });
  res.status(500).json({ error: 'This is a test error, check your logs/alerts' });
});
 


app.listen(PORT, () => {
  logInfo('server started', { port: PORT });
});