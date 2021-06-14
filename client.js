const WebSocket = require('ws');

const client = new WebSocket('ws://localhost:8081');

client.on('message', console.log);
