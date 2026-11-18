const { Telegraf, Markup } = require('telegraf');
const express = require('express');
const fs = require('fs');

const token = process.env.BOT_TOKEN;
if (!token) {
  console.error('Ошибка: Не задан BOT_TOKEN!');
  process.exit(1);
}

const bot = new Telegraf(token);
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => res.send('Bot is running!'));
app.listen(PORT, () => console.log(`Server is listening on port ${PORT}`));

// Безопасная загрузка базы данных
let db = { general: [], singers: [], adult: [] };
try {
  const data = fs.readFileSync('./celebrities.json', 'utf8');
  db = JSON.parse(data);
  console.log(`База загружена. Актеров: ${db.general.length}, Певцов: ${db.singers.length}, 18+: ${db.adult.length}`);
} catch (e) {
  console.error('Ошибка чтения celebrities.json:', e);
}

const mainMenu = Markup.keyboard([
  ['🎬 Кино и Актеры', '🎤 Певцы и Музыка'],
  ['🔞 18+ Звезды', '👤 Профиль']
]).resize();

bot.start((ctx) => {
  ctx.reply('👋 Привет! Добро пожаловать. Выбери категорию внизу:', mainMenu);
});

// Обработчики кнопок меню
bot.hears('🎬 Кино и Актеры', (ctx) => {
  sendRandomCelebrity(ctx, 'general', '🎬 Кино и Актеры');
});

bot.hears('🎤 Певцы и Музыка', (ctx) => {
  sendRandomCelebrity(ctx, 'singers', '🎤 Певцы и Музыка');
});

bot.hears('🔞 18+ Звезды', (ctx) => {
  ctx.replyWithInvoice({
    title: 'Доступ к категории 🔞 18+',
    description: '1 подборка в эксклюзивной категории 18+',
    payload: 'adult_category_access',
    currency: 'XTR',
    prices: [{ label: 'Доступ', amount: 10 }]
  });
});

bot.hears('👤 Профиль', (ctx) => {
  ctx.reply('👤 Ваш аккаунт:\nБаланс: 0 ⭐\nСтатус: Обычный');
});

bot.on('pre_checkout_query', (ctx) => ctx.answerPreCheckoutQuery(true));
bot.on('successful_payment', (ctx) => {
  ctx.reply('✅ Оплата прошла успешно! Открываю доступ...');
  sendRandomCelebrity(ctx, 'adult', '🔞 18+ Звезды');
});

function sendRandomCelebrity(ctx, categoryKey, categoryName) {
  const list = db[categoryKey];
  if (!list || list.length === 0) {
    return ctx.reply(`⚠️ В категории "${categoryName}" пока пусто.`);
  }
  
  const celeb = list[Math.floor(Math.random() * list.length)];
  const caption = `<b>${celeb.name}</b>\n\n${celeb.desc}\n\n🔗 <a href="${celeb.link}">Читать на Wikipedia</a>`;

  if (celeb.photo && celeb.photo.startsWith('http')) {
    ctx.replyWithPhoto(celeb.photo, { caption: caption, parse_mode: 'HTML' }).catch(() => {
      ctx.reply(caption, { parse_mode: 'HTML' });
    });
  } else {
    ctx.reply(caption, { parse_mode: 'HTML' });
  }
}

bot.on('photo', (ctx) => {
  ctx.reply('📸 Картинка получена! Используй кнопки меню внизу 👇', mainMenu);
});

bot.launch().then(() => console.log('Бот успешно запущен!'));
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));