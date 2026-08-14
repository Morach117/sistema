require('dotenv').config();

const { createApp } = require('./app');
const { loadEnv } = require('./config/env');

const config = loadEnv();

createApp({ corsOrigins: config.corsOrigins }).listen(config.port);
