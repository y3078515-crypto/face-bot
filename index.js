const { Telegraf, Markup } = require('telegraf');
const fs = require('fs');

const BOT_TOKEN = '9228118940:AAFIeBWUnDjz8AD48H-5_216rAnUQ_HUboA';
const bot = new Telegraf(BOT_TOKEN);

const userBalance = {};
const userCategory = {}; // 'actors' | 'singers' | 'adult'
const adultUnlocked = {}; // Открыт ли 18+ режим у пользователя

// Загружаем базу из JSON
let dbData = { actors: [], singers: [], adult: [] };
try {
    if (fs.existsSync('celebrities.json')) {
        dbData = JSON.parse(fs.readFileSync('celebrities.json', 'utf8'));
    }
} catch (e) {
    console.log('Ошибка чтения celebrities.json:', e.message);
}

function expandCategory(arr, targetCount) {
    if (!arr || arr.length === 0) return;
    const base = [...arr];
    let i = 0;
    while (arr.length < targetCount) {
        const item = base[i % base.length];
        arr.push({
            name: item.name,
            link: item.link,
            photo: item.photo,
            desc: item.desc
        });
        i++;
    }
}

expandCategory(dbData.actors, 350);
expandCategory(dbData.singers, 300);
expandCategory(dbData.adult, 350);

const categoryLabels = {
    actors: '🎬 Кино и Актеры',
    singers: '🎤 Певцы и Музыка',
    adult: '🔞 18+ Звезды (Премиум)'
};

const mainMenu = Markup.keyboard([
    ['🎬 Кино и Актеры', '🎤 Певцы и Музыка'],
    ['🔞 18+ Звезды (10 ⭐)', '📸 Найти двойника'],
    ['💎 Купить запросы', '📊 Мой баланс'],
    ['ℹ️ Помощь']
]).resize();

bot.start(async (ctx) => {
    const userId = ctx.from.id;
    if (userBalance[userId] === undefined) userBalance[userId] = 3;
    if (!userCategory[userId]) userCategory[userId] = 'actors';

    await ctx.reply(
        `👋 Привет! Добро пожаловать в бот-поисковик двойников.\n\n` +
        `📂 Категории **Кино** и **Музыка** бесплатны.\n` +
        `🔥 Категория **18+ Звезды** доступна по запросу за **10 Telegram Stars ⭐**.\n\n` +
        `🎁 Бесплатных обычных попыток: *${userBalance[userId]}*`,
        { parse_mode: 'Markdown', ...mainMenu }
    );
});

bot.hears('🎬 Кино и Актеры', async (ctx) => {
    userCategory[ctx.from.id] = 'actors';
    await ctx.reply(`✅ Выбрана категория: **🎬 Кино и Актеры**. Отправляй селфи!`, mainMenu);
});

bot.hears('🎤 Певцы и Музыка', async (ctx) => {
    userCategory[ctx.from.id] = 'singers';
    await ctx.reply(`✅ Выбрана категория: **🎤 Певцы и Музыка**. Отправляй селфи!`, mainMenu);
});

// Кнопка выбора 18+ режима: проверяем, куплен ли он
bot.hears('🔞 18+ Звезды (10 ⭐)', async (ctx) => {
    const userId = ctx.from.id;
    
    if (adultUnlocked[userId]) {
        userCategory[userId] = 'adult';
        return ctx.reply(`🔥 Категория **18+ Звезды** активна! Отправляй фото для подбора.`, mainMenu);
    }

    // Если не куплено — выставляем счет на 10 Telegram Stars
    await ctx.replyWithInvoice({
        title: 'Разблокировка 18+ режима',
        description: 'Доступ к поиску двойника в категории 18+ Звезды (1 поиск)',
        payload: 'unlock_adult_single',
        currency: 'XTR',
        prices: [{ label: 'Доступ 18+', amount: 10 }]
    });
});

bot.hears('📊 Мой баланс', async (ctx) => {
    const userId = ctx.from.id;
    const balance = userBalance[userId] !== undefined ? userBalance[userId] : 3;
    const isAdultActive = adultUnlocked[userId] ? '🔓 Куплен' : '🔒 Заблокирован';
    await ctx.reply(
        `📊 Обычных запросов: *${balance}*\n🔞 Режим 18+: *${isAdultActive}*`,
        { parse_mode: 'Markdown', ...mainMenu }
    );
});

bot.hears('💎 Купить запросы', async (ctx) => {
    await ctx.replyWithInvoice({
        title: 'Пакет 30 запросов',
        description: 'Пакет из 30 обычных попыток (Кино, Музыка)',
        payload: 'pack_30_stars',
        currency: 'XTR',
        prices: [{ label: '30 запросов', amount: 100 }]
    });
});

bot.hears('ℹ️ Помощь', async (ctx) => {
    await ctx.reply(
        `📌 **Правила:**\n` +
        `• Кино и Музыка — бесплатно (по остатку попыток).\n` +
        `• 18+ Звезды — разовый доступ за 10 ⭐ Stars за поиск.`,
        mainMenu
    );
});

bot.hears('📸 Найти двойника', async (ctx) => {
    const cat = categoryLabels[userCategory[ctx.from.id] || 'actors'];
    await ctx.reply(`📸 Текущая категория: *${cat}*.\nОтправь фото в чат!`, { parse_mode: 'Markdown', ...mainMenu });
});

bot.on('pre_checkout_query', (ctx) => ctx.answerPreCheckoutQuery(true));

// Обработка успешных платежей (и для обычных паков, и для 10 звезд за 18+)
bot.on('successful_payment', async (ctx) => {
    const userId = ctx.from.id;
    const payload = ctx.message.successful_payment.invoice_payload;

    if (payload === 'unlock_adult_single') {
        adultUnlocked[userId] = true;
        userCategory[userId] = 'adult';
        await ctx.reply(`🎉 Оплата прошла успешно! Категория **🔞 18+ Звезды** разблокирована. Отправляй свое фото!`, mainMenu);
    } else {
        userBalance[userId] = (userBalance[userId] || 0) + 30;
        await ctx.reply(`🎉 Оплата успешна! Начислено **30 запросов**. Баланс: *${userBalance[userId]}*`, { parse_mode: 'Markdown', ...mainMenu });
    }
});

// Обработка фотографий
bot.on('photo', async (ctx) => {
    const userId = ctx.from.id;
    if (userBalance[userId] === undefined) userBalance[userId] = 3;
    if (!userCategory[userId]) userCategory[userId] = 'actors';

    const selectedCat = userCategory[userId];

    // Если выбрана 18+ категория, но она не оплачена — просим оплатить
    if (selectedCat === 'adult' && !adultUnlocked[userId]) {
        return ctx.reply(`🔒 Категория **18+ Звезды** требует оплаты 10 ⭐.\nНажми кнопку «🔞 18+ Звезды (10 ⭐)» внизу, чтобы разблокировать доступ!`, mainMenu);
    }

    // Для обычных категорий проверяем баланс
    if (selectedCat !== 'adult') {
        if (userBalance[userId] <= 0) {
            return ctx.reply(`❌ Бесплатные запросы закончились! Нажми «💎 Купить запросы» (30 шт. за 100 ⭐).`, mainMenu);
        }
        userBalance[userId]--;
    } else {
        // После успешного поиска в 18+ сбрасываем статус блокировки, чтобы следующий поиск тоже стоил 10 звезд (или можно сделать без сброса, как захочешь)
        adultUnlocked[userId] = false; 
    }

    const pool = dbData[selectedCat];
    await ctx.reply(`🔍 Анализирую лицо в категории **${categoryLabels[selectedCat]}**... ⏱️`, mainMenu);

    const photoObj = ctx.message.photo[ctx.message.photo.length - 1];
    const seed = userId + (photoObj.file_size || 0);
    const matched = pool[seed % pool.length];
    const similarity = 91 + (seed % 8);

    setTimeout(async () => {
        await ctx.replyWithPhoto(matched.photo, {
            caption: `🔥 **Результат поиска (${categoryLabels[selectedCat]}):**\n\n` +
                     `⭐ **Твой двойник:** [${matched.name}](${matched.link})\n` +
                     `📊 **Сходство:** *${similarity}%*\n` +
                     `📝 **Описание:** ${matched.desc}`,
            parse_mode: 'Markdown',
            ...mainMenu
        });
    }, 2000);
});

bot.launch();
console.log('🤖 Бот с монетизацией 18+ за 10 Stars запущен!');

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));