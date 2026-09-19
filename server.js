'use strict';

const express = require('express');
const path = require('node:path');
const { createApi } = require('./src/api/routes');

const app = express();
const port = process.env.PORT || 3000;
const visualisationDir = path.join(__dirname, 'Sweeesh', 'visualisation');

app.use(express.json({ limit: '1mb' }));
app.use(express.static(visualisationDir));

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'sweesh-core',
    architecture: 'attestations + delegated authority + per-claim chain resolution',
    timestamp: new Date().toISOString()
  });
});

app.use('/api', createApi());

app.get('/', (req, res) => {
  res.sendFile(path.join(visualisationDir, 'index.html'));
});

if (require.main === module) {
  app.listen(port, () => {
    console.log(`Sweesh core listening on http://localhost:${port}`);
    console.log(`  visualisation   http://localhost:${port}/`);
    console.log(`  resolved resume http://localhost:${port}/api/resume`);
    console.log(`  adversarial     http://localhost:${port}/api/adversarial`);
  });
}

module.exports = app;
