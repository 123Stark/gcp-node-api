const express = require('express');
const pool = require('./db');
const { logInfo, logError } = require('./logger');
const { PubSub } = require('@google-cloud/pubsub');


const pubsub = new PubSub();
const TASK_EVENTS_TOPIC = 'task-events';

async function publishTaskEvent(eventType, task) {
  try {
    const data = Buffer.from(JSON.stringify({ eventType, task, ts: new Date().toISOString() }));
    await pubsub.topic(TASK_EVENTS_TOPIC).publishMessage({ data });
    logInfo('task event published', { eventType, taskId: task.id });
  } catch (err) {
    logError('failed to publish task event', err, { eventType, taskId: task.id });
  }
}


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
    publishTaskEvent('task.created', rows[0]);
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

// Pub/Sub push endpoint — сюда Pub/Sub сам присылает POST при новом сообщении.
// Формат тела запроса фиксированный, его задаёт Pub/Sub, не мы:
// { message: { data: <base64>, messageId, publishTime }, subscription }
app.post('/pubsub/task-events', (req, res) => {
  try {
    const message = req.body.message;
    if (!message || !message.data) {
      logError('pubsub push: malformed request', null, { body: req.body });
      return res.status(400).send('Bad Request: missing message.data');
    }
 
    const decoded = Buffer.from(message.data, 'base64').toString('utf8');
    const event = JSON.parse(decoded);
 
    logInfo('pubsub push received', {
      eventType: event.eventType,
      taskId: event.task && event.task.id,
      messageId: message.messageId,
    });
 
    // Тут в реальном проекте была бы обработка события —
    // отправка email, запись в аналитику и т.п.
 
    res.status(204).send();
  } catch (err) {
    logError('pubsub push: failed to process', err);
    // Возвращаем 500 — Pub/Sub повторит доставку позже
    res.status(500).send('Internal error');
  }
});
 

 


app.listen(PORT, () => {
  logInfo('server started', { port: PORT });
});