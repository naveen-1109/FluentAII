import path from 'node:path';
import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { openDb } from './db.js';
import { HttpSpeechClient } from './speechClient.js';

const config = loadConfig();
const db = openDb(path.join(config.dataDir, 'fluentai.db'));
const speech = new HttpSpeechClient(config.speechServiceUrl, config.speechServiceKey);
const { app } = createApp({ db, config, speech });

app.listen(config.port, () => {
  console.log(`FluentAI API listening on http://localhost:${config.port} (${config.env})`);
});
