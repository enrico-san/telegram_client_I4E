const { writeFileSync } = require('fs')
const { Api, TelegramClient } = require('telegram')
const { StringSession } = require('telegram/sessions')
const { Logger } = require('telegram/extensions');
const { sleep } = require('telegram/Helpers');
const WebSocket = require('ws');

let { readCount } = require(`${process.env.APP_PATH}/state.json`);
let { silence } = require(`${process.env.APP_PATH}/silence.json`);
for(let i=0; i<silence.length; i++) {
  let [h, m] = silence[i].from
  silence[i].from_sec = h*3600 + m*60
  let [h1, m1] = silence[i].to
  silence[i].to_sec = h1*3600 + m1*60
}

const users = require(`${process.env.APP_PATH}/users.json`)

Logger.setLevel('error');

const apiId = process.env.TELEGRAM_ID
const apiHash = process.env.TELEGRAM_HASH
const stringSession = new StringSession(process.env.TELEGRAM_SESSION_KIDU2);

const wss = new WebSocket.Server({ port: 8081 });
let ws = undefined
let client, started
const queue = []

const delayed_queue = []
let dequeu_pid

wss.on('connection', async ws_ => {
  ws = ws_

  ws.on('message', async message => {
    if (!client) {
      return
    }
    const data = JSON.parse(message)
    // console.log(data)
    if (data.command === 'log') {
      delayed_queue.push(data.message)
    }
  })

  clearInterval(dequeu_pid)
  dequeu_pid = setInterval(async () => {
    if (!started) {
      return
    }
    
    if (delayed_queue.length) {
      const message = {
        peer: users.admin,
        message: delayed_queue.join('\n'),
        randomId: Math.floor(Math.random() * 4156887774564),
        noWebpage: true,
      }
      try {
        await client.invoke(new Api.messages.SendMessage(message))
        delayed_queue.length = 0
      } catch(e) {
        console.log(e)
      }
    }
  }, Math.random() * 5000 + 5000)

  await sleep(15000)
  if (queue.length) {
    console.log('sending to client', queue)
    ws.send(JSON.stringify(queue))
    queue.length = 0
  }
});

function silence_time() {
  if (process.env.I4E_CAN_SHOW_MESSAGE === '1') {
    return false
  }
  const h = new Date().getHours()
  const m = new Date().getMinutes()
  const now = h*3600 + m*60
  return silence.map(({from_sec, to_sec}) => now > from_sec && now < to_sec).some(_=>_)
}

async function telegram_client() {
  console.log('wait 30 sec until networking is ready')
  // ensure networking is ready
  await sleep(30000)
  
  client = new TelegramClient(stringSession, apiId, apiHash, { connectionRetries: 5 })
  try {
    await client.start();
  } catch {
    client = undefined
    await sleep(20000)
    setImmediate(telegram_client)
  }
  started = true
  console.log('started (logged in)')
  
  while(true) {
    if (silence_time()) {
      console.log('silence')
      await sleep(60000)
      continue
    }

    const state = await client.invoke(new Api.updates.GetState({}));
    // console.log('unread/read', state.unreadCount, readCount)
    if (state.unreadCount < readCount) {
      // another device has read/cleared the messages
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
