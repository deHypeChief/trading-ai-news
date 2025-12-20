const { spawn } = require('child_process');
const path = require('path');

const migrations = [
  {
    name: 'migrate-subscriptions',
    script: 'migrate-subscriptions.js',
    description: 'Migrate user subscriptions data structure'
  },
  {
    name: 'migrate-volatility',
    script: 'migrate-volatility.js',
    description: 'Migrate volatility fields and scoring system'
  },
  {
    name: 'add-missing-summaries',
    script: 'add-missing-summaries.js',
    description: 'Add AI summaries to events that don\'t have them'
  },
  {
    name: 'populate-pip-range',
    script: 'populate-pip-range.js',
    description: 'Populate pip range for events using minute candles (Twelve Data)'
  },
  {
    name: 'reanalyze-volatility',
    script: 'reanalyze-volatility.js',
    description: 'Re-analyze volatility for all events with latest AI models'
  }
];

async function runMigration(migration) {
  return new Promise((resolve, reject) => {
    console.log(`\n🚀 Running migration: ${migration.name}`);
    console.log(`📝 ${migration.description}`);

    const scriptPath = path.join(__dirname, migration.script);
    const isTypeScript = migration.script.endsWith('.ts');

    // Use bun for all scripts since it can handle TypeScript
    const command = 'bun';
    const args = ['run', scriptPath];

    const child = spawn(command, args, {
      stdio: 'inherit',
      cwd: path.dirname(__dirname) // Go up one level to backend directory
    });

    child.on('close', (code) => {
      if (code === 0) {
        console.log(`✅ Migration ${migration.name} completed successfully`);
        resolve();
      } else {
        console.error(`❌ Migration ${migration.name} failed with exit code ${code}`);
        reject(new Error(`Migration ${migration.name} failed`));
      }
    });

    child.on('error', (error) => {
      console.error(`❌ Error running migration ${migration.name}:`, error);
      reject(error);
    });
  });
}

async function runAllMigrations() {
  console.log('🔄 Starting comprehensive migration suite...');
  console.log('📊 Found', migrations.length, 'migration scripts');

  const results = {
    successful: [],
    failed: []
  };

  for (const migration of migrations) {
    try {
      await runMigration(migration);
      results.successful.push(migration.name);
    } catch (error) {
      results.failed.push(migration.name);
      console.error(`💥 Migration ${migration.name} failed, but continuing with others...`);

      // Ask user if they want to continue
      const readline = require('readline');
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
      });

      await new Promise((resolve) => {
        rl.question('One migration failed. Continue with remaining migrations? (y/N): ', (answer) => {
          rl.close();
          if (answer.toLowerCase() !== 'y' && answer.toLowerCase() !== 'yes') {
            console.log('🛑 Migration suite stopped by user');
            process.exit(1);
          }
          resolve();
        });
      });
    }
  }

  // Summary
  console.log('\n📊 Migration Summary:');
  console.log(`✅ Successful: ${results.successful.length}`);
  results.successful.forEach(name => console.log(`   - ${name}`));

  if (results.failed.length > 0) {
    console.log(`❌ Failed: ${results.failed.length}`);
    results.failed.forEach(name => console.log(`   - ${name}`));
    process.exit(1);
  } else {
    console.log('🎉 All migrations completed successfully!');
  }
}

// Check if running directly
if (require.main === module) {
  runAllMigrations().catch((error) => {
    console.error('💥 Migration suite failed:', error);
    process.exit(1);
  });
}

module.exports = { runAllMigrations, runMigration };