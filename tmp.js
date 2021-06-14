const {Api, TelegramClient} = require('telegram');
const {StringSession} = require('telegram/sessions');
const { Logger } = require('telegram/extensions');
Logger.setLevel('error');

const apiId = process.env.TELEGRAM_ID
const apiHash = process.env.TELEGRAM_HASH
const stringSession = new StringSession(process.env.TELEGRAM_SESSION_KIDU2);
const client = new TelegramClient(stringSession, apiId, apiHash, {});

(async function run() {
  await client.start();  
  const result = await client.invoke(new Api.messages.SendMessage({
    peer: 'enrico_san_31415',
    message: 'yo',
    randomId: Math.floor(Math.random() * 4156887774564),
    noWebpage: true,
  }))
  console.log(result)
})();