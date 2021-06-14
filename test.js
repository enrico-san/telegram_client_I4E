'use strict';

const https = require('https');
const fs = require('fs');

const WebSocket = require('ws');

const hostname = '127.0.0.1';
const port = 8081;

const server = https.createServer({
  cert: fs.readFileSync('./certificates/i4e_public.pem', 'utf8'),
  key: fs.readFileSync('./certificates/i4e_private.pem', 'utf8'),
  port: 8081
});

const wss = new WebSocket.Server({ server });

wss.on('connection', ws => {
  ws.on('message', console.log);
});

server.listen(port, () => {
  console.log(`serving on ${server.address().port}`)

  // const ws = new WebSocket(`wss://localhost:${server.address().port}`, {
  //   rejectUnauthorized: false
  // });

  // ws.on('open', function open() {
  //   ws.send('All glory to WebSockets!');
  // });
});