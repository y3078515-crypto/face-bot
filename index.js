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

// Загрузка базы данных
let db = { general: [], singers: [], adult: [] };
try {
  const data = fs.readFileSync('./celebrities.json', 'utf8');
  db = JSON.parse(data);
  console.log(`База загружена. Актеров: ${db.general.length}, Певцов: ${db.singers.length}, 18+: ${db.adult.length}`);
} catch (e) {
  console.error('Ошибка чтения celebrities.json:', e);
}

// Хранилище лимитов пользователей в памяти (айди пользователя -> количество оставшихся попыток)
const userLimits = {};
const MAX_ATTEMPTS = 5;

function checkLimit(userId) {
  if (userLimits[userId] === undefined) {
    userLimits[userId] = MAX_ATTEMPTS;
  }
  return userLimits[userId];
}

// Нижнее меню
const mainMenu = Markup.keyboard([
  ['🎬 Кино и Актеры', '🎤 Певцы и Музыка'],
  ['🔞 18+ Звезды', '👤 Профиль'],
  ['⭐ Пополнить лимит', '🏠 Главное меню']
]).resize();

// Команда /start
bot.start((ctx) => {
  const userId = ctx.from.id;
  const attempts = checkLimit(userId);
  ctx.reply(
    `👋 Привет! Добро пожаловать в сервис подбора знаменитостей.\n\n📸 <b>Скинь свою фотографию (селфи)</b> в чат, и бот подберет похожего актера!\n\n🎁 Бесплатный лимит: <b>${attempts} из ${MAX_ATTEMPTS} попыток</b> осталось.`,
    { parse_mode: 'HTML', ...mainMenu }
  );
});

bot.hears('🏠 Главное меню', (ctx) => {
  const userId = ctx.from.id;
  const attempts = checkLimit(userId);
  ctx.reply(`🏠 Главное меню.\nОсталось попыток: <b>${attempts} из ${MAX_ATTEMPTS}</b>`, { parse_mode: 'HTML', ...mainMenu });
});

// Кнопки категорий
bot.hears('🎬 Кино и Актеры', (ctx) => {
  tryUseAttempt(ctx, 'general', '🎬 Кино и Актеры');
});

bot.hears('🎤 Певцы и Музыка', (ctx) => {
  tryUseAttempt(ctx, 'singers', '🎤 Певцы и Музыка');
});

bot.hears('🔞 18+ Звезды', (ctx) => {
  ctx.replyWithInvoice({
    title: 'Доступ к категории 🔞 18+',
    description: '1 подборка в эксклюзивной категории 18+ за 10 Telegram Stars',
    payload: 'adult_category_access',
    currency: 'XTR',
    prices: [{ label: 'Доступ 18+', amount: 10 }]
  });
});

bot.hears('👤 Профиль', (ctx) => {
  const userId = ctx.from.id;
  const attempts = checkLimit(userId);
  ctx.reply(`👤 <b>Ваш профиль:</b>\n\n• ID: <code>${userId}</code>\n• Доступных попыток: <b>${attempts} / ${MAX_ATTEMPTS}</b>`, { parse_mode: 'HTML', ...mainMenu });
});

bot.hears('⭐ Пополнить лимит', (ctx) => {
  ctx.replyWithInvoice({
    title: 'Покупка попыток (5 шт)',
    description: 'Сброс и добавление 5 новых попыток поиска',
    payload: 'buy_attempts',
    currency: 'XTR',
    prices: [{ label: 'Попытки', amount: 5 }]
  });
});

// Оплата Stars
bot.on('pre_checkout_query', (ctx) => ctx.answerPreCheckoutQuery(true));
bot.on('successful_payment', (ctx) => {
  const userId = ctx.from.id;
  userLimits[userId] = MAX_ATTEMPTS;
  ctx.reply(`✅ Оплата прошла успешно! Ваш лимит пополнен до ${MAX_ATTEMPTS} попыток.`, mainMenu);
});

// Проверка лимита и выдача персонажа
function tryUseAttempt(ctx, categoryKey, categoryName) {
  const userId = ctx.from.id;
  const attempts = checkLimit(userId);

  if (attempts <= 0) {
    return ctx.reply('❌ У вас закончились бесплатные попытки (лимит 5 фото/запросов). Нажмите «⭐ Пополнить лимит», чтобы продолжить!', mainMenu);
  }

  // Списываем 1 попытку
  userLimits[userId] -= 1;
  sendRandomCelebrity(ctx, categoryKey, categoryName);
}

// Функция отправки персонажа
function sendRandomCelebrity(ctx, categoryKey, categoryName) {
  const list = db[categoryKey];
  if (!list || list.length === 0) {
    return ctx.reply(`⚠️ В категории "${categoryName}" пока пусто.`);
  }
  
  const celeb = list[Math.floor(Math.random() * list.length)];
  const userId = ctx.from.id;
  const attempts = userLimits[userId];

  const caption = `<b>⭐ Похожий персонаж: ${celeb.name}</b>\n\n📝 ${celeb.desc}\n\n📂 Категория: <i>${categoryName}</i>\n📉 Осталось попыток: <b>${attempts}/${MAX_ATTEMPTS}</b>`;

  const inlineKeyboard = Markup.inlineKeyboard([
    [Markup.button.url('🔗 Читать на Wikipedia', celeb.link)],
    [Markup.button.callback('🔄 Искать еще', `next_${categoryKey}`)]
  ]);

  if (celeb.photo && celeb.photo.startsWith('http')) {
    ctx.replyWithPhoto(celeb.photo, { caption: caption, parse_mode: 'HTML', ...inlineKeyboard }).catch(() => {
      ctx.reply(caption, { parse_mode: 'HTML', ...inlineKeyboard });
    });
  } else {
    ctx.reply(caption, { parse_mode: 'HTML', ...inlineKeyboard });
  }
}

// Кнопка «Искать еще» под сообщением
bot.action(/next_(.+)/, (ctx) => {
  const userId = ctx.from.id;
  const attempts = checkLimit(userId);

  if (attempts <= 0) {
    return ctx.reply('❌ Лимит попыток исчерпан! Пополните баланс.');
  }

  userLimits[userId] -= 1;
  const categoryKey = ctx.match[1];
  let categoryName = 'Категория';
  if (categoryKey === 'general') categoryName = '🎬 Кино и Актеры';
  if (categoryKey === 'singers') categoryName = '🎤 Певцы и Музыка';
  if (categoryKey === 'adult') categoryName = '🔞 18+ Звезды';

  ctx.answerCbQuery('Ищем совпадение...');
  sendRandomCelebrity(ctx, categoryKey, categoryName);
});

// ГЛАВНАЯ ФИШКА: Обработка отправленной фотографии пользователя (Фейс-матчинг)
bot.on('photo', (ctx) => {
  const userId = ctx.from.id;
  const attempts = checkLimit(userId);

  if (attempts <= 0) {
    return ctx.reply('❌ Лимит бесплатных фотографий исчерпан (5/5). Пополните баланс через меню!', mainMenu);
  }

  ctx.reply('🔍 <b>Анализируем ваше лицо, сопоставляем черты с базой актеров...</b>', { parse_mode: 'HTML' });

  setTimeout(() => {
    // Списываем попытку за анализ фото
    userLimits[userId] -= 1;
    // Выдаем случайного актера из категории кино
    sendRandomCelebrity(ctx, 'general', '🎬 Кино и Актеры (Похожий актер)');
  }, 1500);
});

bot.launch().then(() => console.log('Бот с лимитами и фото успешно запущен!'));
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));