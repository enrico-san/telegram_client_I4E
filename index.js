const { writeFileSync } = require('fs')
const { Api, TelegramClient } = require('telegram')
const { StringSession } = require('telegram/sessions')
const { Logger } = require('telegram/extensions');
const { sleep } = require('telegram/Helpers');
const WebSocket = require('ws');

let { readCount } = require(`${process.env.APP_PATH}/state.json`);
const users = require(`${process.env.APP_PATH}/users.json`)

Logger.setLevel('error');

const apiId = process.env.TELEGRAM_ID
const apiHash = process.env.TELEGRAM_HASH
const stringSession = new StringSession(process.env.TELEGRAM_SESSION_KIDU2);

const wss = new WebSocket.Server({ port: 8081 });
let ws = undefined
let client
const queue = []

const delayed_queue = []
let dequeu_pid

wss.on('connection', async ws_ => {
  ws = ws_

  ws.on('message', async message => {
    console.log('onmessage')
    if (!client) {
      return
    }
    const data = JSON.parse(message)
    // console.log(data)
    const admin = users.admin
    if (data.command === 'log') {
      const message = {
        peer: admin,
        message: data.message,
        randomId: Math.floor(Math.random() * 4156887774564),
        noWebpage: true,
      }
      // discard after 100th unsent message
      delayed_queue.length < 100 && delayed_queue.push(message)
    }
  })

  clearInterval(dequeu_pid)
  dequeu_pid = setInterval(async () => {
    if (delayed_queue.length) {
      const message = delayed_queue.splice(0, 1)[0]
      try {
        await client.invoke(new Api.messages.SendMessage(message))
      } catch(e) {
        console.log(e)
      }
    }
  }, 1200)

  await sleep(15000)
  if (queue.length) {
    console.log('sending to client', queue)
    ws.send(JSON.stringify(queue))
    queue.length = 0
  }
});

async function telegram_client() {
  client = new TelegramClient(stringSession, apiId, apiHash, { connectionRetries: 5 })
  await client.start();
  
  while(true) {
    const state = await client.invoke(new Api.updates.GetState({}));
    // console.log(state.unreadCount)
    // another device has read the messages
    if (state.unreadCount < readCount) {
      readCount = 0
    }

    if (state.unreadCount > readCount) {
      const diff = await client.invoke(new Api.updates.GetDifference({
        pts: state.pts - state.unreadCount + readCount,
        date: state.date,
        qts: state.qts,
        ptsTotalLimit: 10,
        seq: state.seq,
      }))

      if (!diff.newMessages) {
        continue
      }
      
      // for(let m of diff.newMessages) {
      //   console.log('msg id:', m.id)
      // }

      const msg_result = await client.invoke(new Api.messages.GetMessages({
        id: diff.newMessages.map(m => m.id)
      }))

      for(let msg of msg_result.messages) {
        writeFileSync(`${process.env.APP_PATH}/media/${msg.id}.json`, JSON.stringify(msg, undefined, 2))
        
        let payload
        if (msg.media) {
          const isPhoto = msg.media.photo !== undefined
          const isDocument = msg.media.document !== undefined
          const isVideo = !isPhoto && isDocument && msg.media.document.mimeType.startsWith('video')
          const isVoice = !isPhoto && isDocument && msg.media.document.mimeType.startsWith('audio')

          let mimeType = ''
          if (isPhoto) {
            mimeType = 'image/jpeg'
          } else if (isDocument) {
            mimeType = msg.media.document.mimeType
          }

          // skip the rest
          if (mimeType.startsWith('application') || !(isPhoto || isVideo || isVoice)) {
            continue
          }

          const file = `${process.env.APP_PATH}/media/msg-${msg.id}`
          payload = { 
            id: msg.id,
            url: `http://localhost:5000/msg-${msg.id}`,
            mimeType,
            isPhoto,
            isVideo,
            isVoice,
            isText: false,
            text: '',
            sender: users[msg.peerId.userId]
          }
          queue.push(payload)
          const buffer = await client.downloadMedia(msg.media, {workers: 1});
          writeFileSync(file, buffer)
        } else {
          payload = {
            id: msg.id,
            isPhoto: false,
            isVideo: false,
            isVoice: false,
            isText: true,
            text: msg.message,
            sender: users[msg.peerId.userId]
          }
          queue.push(payload)
        }
      }

      readCount = state.unreadCount
      writeFileSync(`${process.env.APP_PATH}/state.json`, JSON.stringify({readCount}))

      // notify UI
      if (ws && queue.length) {
        console.log('sending to client', queue)
        ws.send(JSON.stringify(queue))
        queue.length = 0
      }
    }
    await sleep(2000)
  }
}

telegram_client()