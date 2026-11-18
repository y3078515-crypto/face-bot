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

// Хранилища в памяти
const userLimits = {};      // id пользователя -> оставшиеся попытки
const waitingForPhoto = {}; // id пользователя -> категория, которую он ждет ('general', 'singers', etc.)
const photoCache = {};      // file_id фото -> индекс персонажа в базе (чтобы одно и то же фото давало того же актера)

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
  waitingForPhoto[userId] = null;
  const attempts = checkLimit(userId);
  ctx.reply(
    `👋 Привет! Добро пожаловать в сервис поиска двойников.\n\n👇 Нажми категорию в меню (например, «🎬 Кино и Актеры»), после чего бот попросит прислать фото.`,
    { parse_mode: 'HTML', ...mainMenu }
  );
});

bot.hears('🏠 Главное меню', (ctx) => {
  const userId = ctx.from.id;
  waitingForPhoto[userId] = null;
  const attempts = checkLimit(userId);
  ctx.reply(`🏠 Главное меню.\nОсталось попыток: <b>${attempts} из ${MAX_ATTEMPTS}</b>`, { parse_mode: 'HTML', ...mainMenu });
});

// Кнопка «Кино и Актеры» — теперь она просит фото!
bot.hears('🎬 Кино и Актеры', (ctx) => {
  const userId = ctx.from.id;
  const attempts = checkLimit(userId);

  if (attempts <= 0) {
    return ctx.reply('❌ У вас закончились бесплатные попытки (5/5). Нажмите «⭐ Пополнить лимит»!', mainMenu);
  }

  waitingForPhoto[userId] = 'general';
  ctx.reply('📸 <b>Жду ваше фото!</b> Отправьте селфи или картинку в чат, чтобы узнать своего двойника из мира кино.', { parse_mode: 'HTML', ...mainMenu });
});

// Кнопка «Певцы и Музыка» — тоже просит фото
bot.hears('🎤 Певцы и Музыка', (ctx) => {
  const userId = ctx.from.id;
  const attempts = checkLimit(userId);

  if (attempts <= 0) {
    return ctx.reply('❌ У вас закончились бесплатные попытки (5/5). Нажмите «⭐ Пополнить лимит»!', mainMenu);
  }

  waitingForPhoto[userId] = 'singers';
  ctx.reply('📸 <b>Жду ваше фото!</b> Отправьте картинку в чат для подбора музыкального исполнителя.', { parse_mode: 'HTML', ...mainMenu });
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

// ОБРАБОТКА ФОТОГРАФИИ ОТ ПОЛЬЗОВАТЕЛЯ
bot.on('photo', (ctx) => {
  const userId = ctx.from.id;
  const attempts = checkLimit(userId);

  if (attempts <= 0) {
    waitingForPhoto[userId] = null;
    return ctx.reply('❌ Лимит бесплатных попыток исчерпан (5/5). Пополните баланс через меню!', mainMenu);
  }

  // Если пользователь прислал фото просто так, без выбора категории — по умолчанию берем кино
  const categoryKey = waitingForPhoto[userId] || 'general';
  const list = db[categoryKey];

  if (!list || list.length === 0) {
    return ctx.reply('⚠️ В базе данных нет записей для этой категории.');
  }

  // Берем уникальный file_id фотографии (или берем file_unique_id)
  const photoObj = ctx.message.photo[ctx.message.photo.length - 1];
  const fileUniqueId = photoObj.file_unique_id;

  let celebIndex;

  // Если такое фото уже присылали, закрепляем за ним того же персонажа!
  if (photoCache[fileUniqueId] !== undefined) {
    celebIndex = photoCache[fileUniqueId];
  } else {
    // Если фото новое, выбираем случайного персонажа и запоминаем для этого фото
    celebIndex = Math.floor(Math.random() * list.length);
    photoCache[fileUniqueId] = celebIndex;
    
    // Списываем попытку только за НОВОЕ уникальное фото
    userLimits[userId] -= 1;
  }

  const celeb = list[celebIndex];
  const currentAttempts = userLimits[userId];
  const categoryName = categoryKey === 'singers' ? '🎤 Певцы и Музыка' : '🎬 Кино и Актеры';

  ctx.reply('🔍 <b>Анализируем черты лица, сканируем биометрию...</b>', { parse_mode: 'HTML' });

  setTimeout(() => {
    const caption = `<b>⭐ Ваш двойник: ${celeb.name}</b>\n\n📝 ${celeb.desc}\n\n📂 Категория: <i>${categoryName}</i>\n📉 Осталось попыток: <b>${currentAttempts}/${MAX_ATTEMPTS}</b>`;

    const inlineKeyboard = Markup.inlineKeyboard([
      [Markup.button.url('🔗 Читать на Wikipedia', celeb.link)],
      [Markup.button.callback('🔄 Сбросить режим', 'reset_mode')]
    ]);

    if (celeb.photo && celeb.photo.startsWith('http')) {
      ctx.replyWithPhoto(celeb.photo, { caption: caption, parse_mode: 'HTML', ...inlineKeyboard }).catch(() => {
        ctx.reply(caption, { parse_mode: 'HTML', ...inlineKeyboard });
      });
    } else {
      ctx.reply(caption, { parse_mode: 'HTML', ...inlineKeyboard });
    }

    // Сбрасываем статус ожидания фото для этого юзера
    waitingForPhoto[userId] = null;
  }, 1200);
});

// Кнопка сброса режима под сообщением
bot.action('reset_mode', (ctx) => {
  const userId = ctx.from.id;
  waitingForPhoto[userId] = null;
  ctx.answerCbQuery('Режим сброшен');
  ctx.reply('Выберите категорию в меню ниже 👇', mainMenu);
});

bot.launch().then(() => console.log('Бот с привязкой фото успешно запущен!'));
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));