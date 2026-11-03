import { app } from './app.js';
import { db } from './db.js';

const port = process.env.PORT || 3000;

const server = app.listen(Number(port), '0.0.0.0', () => {
  console.log(`Server is running on http://0.0.0.0:${port}`);
});

function handleShutdown(signal: string) {
  console.log(`Received ${signal}. Starting graceful shutdown...`);
  server.close(() => {
    console.log('HTTP server closed.');
    try {
      db.exec('PRAGMA wal_checkpoint(TRUNCATE);');
      db.close();
      console.log('SQLite database closed cleanly.');
    } catch (err) {
      console.error('Error during database close:', err);
    }
    process.exit(0);
  });

  // Force exit after 10s if connections fail to drain
  setTimeout(() => {
    console.error('Graceful shutdown timed out, forcing exit.');
    process.exit(1);
  }, 10000).unref();
}

process.on('SIGTERM', () => handleShutdown('SIGTERM'));
process.on('SIGINT', () => handleShutdown('SIGINT'));
