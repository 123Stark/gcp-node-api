const db = require('./db');
const fs = require('fs');
const path = require('path');

async function createMigrationTable() {
  const query = `
    CREATE TABLE IF NOT EXISTS migrations (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL UNIQUE,
      applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `;
  await db.query(query);
  console.log('✅ Migration tracking table created/verified');
}

async function getAppliedMigrations() {
  const result = await db.query('SELECT name FROM migrations ORDER BY name');
  return result.rows.map(row => row.name);
}

async function recordMigration(name) {
  await db.query('INSERT INTO migrations (name) VALUES ($1)', [name]);
  console.log(`📝 Recorded migration: ${name}`);
}

async function runMigrations() {
  console.log('🚀 Starting migrations...');
  
  try {
    await createMigrationTable();
    const appliedMigrations = await getAppliedMigrations();
    console.log(`📋 Applied migrations: ${appliedMigrations.length > 0 ? appliedMigrations.join(', ') : 'none'}`);
    
    const migrationsDir = path.join(__dirname, 'migrations');
    if (!fs.existsSync(migrationsDir)) {
      console.log('⚠️  No migrations directory found');
      return;
    }
    
    const files = fs.readdirSync(migrationsDir)
      .filter(file => file.endsWith('.sql'))
      .sort();
    
    console.log(`📁 Found ${files.length} migration files`);
    
    let appliedCount = 0;
    
    for (const file of files) {
      if (!appliedMigrations.includes(file)) {
        console.log(`📝 Applying migration: ${file}`);
        const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
        await db.query(sql);
        await recordMigration(file);
        appliedCount++;
        console.log(`✅ Migration ${file} applied successfully`);
      } else {
        console.log(`⏭️  Migration ${file} already applied, skipping`);
      }
    }
    
    console.log(`🎉 All migrations completed! Applied ${appliedCount} new migrations.`);
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await db.end();  // Закрываем соединение
  }
}

runMigrations();