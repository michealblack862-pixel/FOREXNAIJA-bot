const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const cron = require('node-cron');

// ==== CONFIG (set these in Railway's Environment Variables tab) ====
const BOT_TOKEN = process.env.BOT_TOKEN;
const CHAT_ID = process.env.CHAT_ID;
const EXCHANGE_API_KEY = process.env.EXCHANGE_API_KEY;

// Currencies you want tracked against NGN
const CURRENCIES = ['USD', 'GBP', 'EUR', 'CAD', 'ZAR', 'CNY'];

if (!BOT_TOKEN || !CHAT_ID || !EXCHANGE_API_KEY) {
  console.error('Missing required environment variables. Check BOT_TOKEN, CHAT_ID, EXCHANGE_API_KEY.');
  process.exit(1);
}

const bot = new TelegramBot(BOT_TOKEN, { polling: true });

// ==== Fetch live rates (base = USD, we derive NGN conversion for each currency) ====
async function getRates() {
  const url = `https://v6.exchangerate-api.com/v6/${EXCHANGE_API_KEY}/latest/NGN`;
  const res = await axios.get(url);

  if (res.data.result !== 'success') {
    throw new Error('Exchange rate API returned an error');
  }

  // res.data.conversion_rates gives: 1 NGN = X of that currency
  // We want: 1 unit of currency = ? NGN, so we invert
  const ngnRates = {};
  CURRENCIES.forEach((code) => {
    const rate = res.data.conversion_rates[code];
    if (rate) {
      ngnRates[code] = (1 / rate).toFixed(2);
    }
  });

  return ngnRates;
}

// ==== Format the message ====
function formatMessage(rates, label) {
  const lines = Object.entries(rates).map(
    ([code, value]) => `${code} → ₦${Number(value).toLocaleString()}`
  );
  return `📊 ${label}\n\n${lines.join('\n')}\n\n_Source: exchangerate-api.com_`;
}

// ==== /today command: on-demand current rates ====
bot.onText(/\/today/, async (msg) => {
  const chatId = msg.chat.id;
  try {
    const rates = await getRates();
    const message = formatMessage(rates, 'Current Rates to NGN');
    bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
  } catch (err) {
    console.error(err.message);
    bot.sendMessage(chatId, '⚠️ Could not fetch rates right now. Try again shortly.');
  }
});

// ==== /help command ====
bot.onText(/\/help/, (msg) => {
  bot.sendMessage(
    msg.chat.id,
    'NairaPulse tracks exchange rates against the naira.\n\n/today - Get current rates\n/help - Show this message\n\nA daily update is also sent automatically every morning.'
  );
});

// ==== Daily automatic update at 8:00 AM Lagos time ====
cron.schedule(
  '0 8 * * *',
  async () => {
    try {
      const rates = await getRates();
      const today = new Date().toDateString();
      const message = formatMessage(rates, `Daily Update — ${today}`);
      bot.sendMessage(CHAT_ID, message, { parse_mode: 'Markdown' });
    } catch (err) {
      console.error('Daily update failed:', err.message);
    }
  },
  { timezone: 'Africa/Lagos' }
);

console.log('NairaPulse bot is running...');
