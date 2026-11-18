const { Telegraf, Markup } = require('telegraf');
const express = require('express');
const fs = require('fs');

// Инициализация бота и веб-сервера для Render
const token = process.env.BOT_TOKEN;
if (!token) {
  console.error('Ошибка: Не задан BOT_TOKEN в переменных окружения!');
  process.exit(1);
}

const bot = new Telegraf(token);
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.send('Bot is running!');
});

app.listen(PORT, () => {
  console.log(`Server is listening on port ${PORT}`);
});

// Загрузка базы данных
let db = { general: [], singers: [], adult: [] };
try {
  const data = fs.readFileSync('./celebrities.json', 'utf8');
  db = JSON.parse(data);
} catch (e) {
  console.error('Ошибка чтения celebrities.json:', e);
}

// Главное меню с кнопками снизу
const mainMenu = Markup.keyboard([
  ['🎬 Кино и Актеры', '🎤 Певцы и Музыка'],
  ['🔞 18+ Звезды', '👤 Профиль']
]).resize();

// Команда /start
bot.start((ctx) => {
  ctx.reply(
    '👋 Привет! Добро пожаловать в сервис подбора знаменитостей.\n\nВыбери интересующую категорию внизу:',
    mainMenu
  );
});

// Обработка текстовых категорий
bot.hears('🎬 Кино и Актеры', (ctx) => {
  sendRandomCelebrity(ctx, 'general', '🎬 Кино и Актеры');
});

bot.hears('🎤 Певцы и Музыка', (ctx) => {
  sendRandomCelebrity(ctx, 'singers', '🎤 Певцы и Музыка');
});

bot.hears('🔞 18+ Звезды', (ctx) => {
  // Проверка баланса / звезд (монетизация через Telegram Stars)
  ctx.replyWithInvoice({
    title: 'Доступ к категории 🔞 18+',
    description: '1 подборка в эксклюзивной категории 18+',
    payload: 'adult_category_access',
    currency: 'XTR', // Telegram Stars
    prices: [{ label: 'Доступ', amount: 10 }]
  });
});

bot.hears('👤 Профиль', (ctx) => {
  ctx.reply('👤 Ваш аккаунт:\nБаланс: 0 ⭐\nСтатус: Обычный');
});

// Обработка успешной оплаты Telegram Stars
bot.on('pre_checkout_query', (ctx) => ctx.answerPreCheckoutQuery(true));
bot.on('successful_payment', (ctx) => {
  ctx.reply('✅ Оплата прошла успешно! Открываю доступ к категории 18+...');
  sendRandomCelebrity(ctx, 'adult', '🔞 18+ Звезды');
});

// Функция отправки случайной звезды из категории
function sendRandomCelebrity(ctx, categoryKey, categoryName) {
  const list = db[categoryKey];
  if (!list || list.length === 0) {
    return ctx.reply('В этой категории пока пусто.');
  }
  
  // Выбираем случайного персонажа
  const celeb = list[Math.floor(Math.random() * list.length)];
  
  const caption = `<b>${celeb.name}</b>\n\n${celeb.desc}\n\n🔗 <a href="${celeb.link}">Читать на Wikipedia</a>`;

  if (celeb.photo) {
    ctx.replyWithPhoto(celeb.photo, {
      caption: caption,
      parse_mode: 'HTML'
    });
  } else {
    ctx.reply(caption, { parse_mode: 'HTML' });
  }
}

// Защита от зависания: если пользователь прислал фото вместо нажатия кнопок
bot.on('photo', (ctx) => {
  ctx.reply('📸 Картинка получена! Но для подбора персонажей используй кнопки меню внизу 👇', mainMenu);
});

// Запуск бота
bot.launch().then(() => {
  console.log('Бот успешно запущен!');
});

// Корректная остановка
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));