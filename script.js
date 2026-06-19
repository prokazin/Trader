// ============================================================
//  КОСМИЧЕСКИЙ ТРЕЙДЕР — ПОЛНЫЙ ИГРОВОЙ ДВИЖОК
// ============================================================

// --- КОНФИГ ---
const ITEMS = [
    { id: 'hydrogen', name: 'Водород', base: 10, vol: 2, icon: '🫧', color: '#5bc0ff' },
    { id: 'steel', name: 'Сталь', base: 25, vol: 8, icon: '⚙️', color: '#aabbdd' },
    { id: 'food', name: 'Еда', base: 15, vol: 3, icon: '🍲', color: '#ffd93d' },
    { id: 'diamonds', name: 'Алмазы', base: 100, vol: 30, icon: '💎', color: '#4cd137' },
    { id: 'plasma', name: 'Плазма', base: 500, vol: 150, icon: '⚡', color: '#e84118' },
];

const LEVELS = [
    { name: 'Новичок', min: 0 },
    { name: 'Трейдер', min: 10 },
    { name: 'Спекулянт', min: 50 },
    { name: 'Магнат', min: 200 },
    { name: 'Легенда', min: 500 },
];

// --- СОСТОЯНИЕ ---
let state = JSON.parse(localStorage.getItem('trader_v3')) || {
    cash: 1000,
    cargo: {},
    maxCargo: 20,
    lastUpdate: Date.now(),
    totalTrades: 0,
    totalEarned: 0,
    totalRisks: 0,
    bestTrade: 0,
    priceHistory: {},
};

// Инициализируем историю цен для каждого товара
ITEMS.forEach(item => {
    if (!state.priceHistory[item.id]) {
        state.priceHistory[item.id] = [];
    }
});

// --- DOM ЭЛЕМЕНТЫ ---
const $ = (id) => document.getElementById(id);
const cashDisplay = $('cashDisplay');
const cargoDisplay = $('cargoDisplay');
const tradeCount = $('tradeCount');
const itemsContainer = $('itemsContainer');
const timeLabel = $('timeLabel');
const riskBtn = $('riskBtn');
const toastEl = $('toast');
const canvas = $('candleChart');
const ctx = canvas.getContext('2d');

// Инвентарь
const invTotal = $('invTotal');
const invFree = $('invFree');
const inventoryGrid = $('inventoryGrid');

// Статистика
const statEarned = $('statEarned');
const statTrades = $('statTrades');
const statRisks = $('statRisks');
const statBest = $('statBest');
const levelDisplay = $('levelDisplay');
const levelProgress = $('levelProgress');

let toastTimer = null;
let currentPrices = [];

// ============================================================
//  ГЕНЕРАЦИЯ ЦЕН (детерминированная)
// ============================================================
function generatePrices() {
    const now = Math.floor(Date.now() / 180000);
    return ITEMS.map(item => {
        const seed = (now * 9301 + item.base * 49297 + item.id.length * 777) % 233280;
        const random = seed / 233280;
        const factor = random * 2 - 1;
        let price = Math.round(item.base + factor * item.vol);
        if (price < 1) price = 1;
        if (item.id === 'plasma' && random > 0.85) return { ...item, price: null };
        return { ...item, price };
    });
}

// ============================================================
//  ОБНОВЛЕНИЕ ИСТОРИИ ЦЕН (для свечей)
// ============================================================
function updatePriceHistory(prices) {
    const now = Date.now();
    prices.forEach(item => {
        if (item.price !== null) {
            if (!state.priceHistory[item.id]) {
                state.priceHistory[item.id] = [];
            }
            state.priceHistory[item.id].push({
                time: now,
                price: item.price,
            });
            // Храним последние 30 точек (90 минут)
            if (state.priceHistory[item.id].length > 30) {
                state.priceHistory[item.id].shift();
            }
        }
    });
}

// ============================================================
//  ОТРИСОВКА СВЕЧЕЙ (Canvas)
// ============================================================
function renderCandles(prices) {
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.parentElement.getBoundingClientRect();
    const width = rect.width - 8;
    const height = 140;

    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = width + 'px';
    canvas.style.height = height + 'px';
    ctx.scale(dpr, dpr);

    // Очистка
    ctx.clearRect(0, 0, width, height);

    // Находим все цены для масштаба
    const allPrices = prices.filter(p => p.price !== null).map(p => p.price);
    if (allPrices.length === 0) {
        ctx.fillStyle = 'rgba(255,255,255,0.05)';
        ctx.font = '12px -apple-system, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('Нет данных', width / 2, height / 2 + 4);
        return;
    }

    const maxPrice = Math.max(...allPrices) * 1.05;
    const minPrice = Math.min(...allPrices) * 0.95;
    const range = maxPrice - minPrice || 1;

    const padding = { top: 10, bottom: 10, left: 8, right: 8 };
    const chartWidth = width - padding.left - padding.right;
    const chartHeight = height - padding.top - padding.bottom;

    // Рисуем сетку
    ctx.strokeStyle = 'rgba(255,255,255,0.03)';
    ctx.lineWidth = 0.5;
    for (let i = 0; i < 4; i++) {
        const y = padding.top + (chartHeight / 4) * i;
        ctx.beginPath();
        ctx.moveTo(padding.left, y);
        ctx.lineTo(width - padding.right, y);
        ctx.stroke();
    }

    // Рисуем свечи
    const candleWidth = Math.min(12, chartWidth / prices.length * 0.7);
    const spacing = chartWidth / prices.length;

    prices.forEach((item, index) => {
        if (item.price === null) return;

        const x = padding.left + index * spacing + spacing / 2;
        const y = padding.top + chartHeight - ((item.price - minPrice) / range) * chartHeight;

        // Цвет свечи (зелёный/красный относительно предыдущей цены)
        const prevPrice = state.priceHistory[item.id]?.[state.priceHistory[item.id].length - 2]?.price || item.price;
        const isUp = item.price >= prevPrice;
        const color = isUp ? '#4cd137' : '#e84118';

        // Тень (wick)
        const wickHeight = Math.max(2, chartHeight * 0.02);
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(x, padding.top + chartHeight - ((item.price - minPrice) / range) * chartHeight);
        ctx.lineTo(x, padding.top + chartHeight - ((item.price - minPrice) / range) * chartHeight + wickHeight);
        ctx.stroke();

        // Тело свечи
        const bodyHeight = Math.max(2, chartHeight * 0.04);
        ctx.fillStyle = color;
        ctx.globalAlpha = 0.6;
        ctx.beginPath();
        const bodyX = x - candleWidth / 2;
        const bodyY = padding.top + chartHeight - ((item.price - minPrice) / range) * chartHeight - bodyHeight / 2;
        const radius = 2;
        ctx.roundRect(bodyX, bodyY, candleWidth, bodyHeight, radius);
        ctx.fill();
        ctx.globalAlpha = 1;

        // Подпись цены (только для крайних)
        if (index === 0 || index === prices.length - 1 || index % 3 === 0) {
            ctx.fillStyle = 'rgba(255,255,255,0.15)';
            ctx.font = '7px -apple-system, sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(item.price, x, height - 2);
        }
    });

    // Заглушка для roundRect в старых браузерах
    if (!CanvasRenderingContext2D.prototype.roundRect) {
        CanvasRenderingContext2D.prototype.roundRect = function(x, y, w, h, r) {
            if (r > w / 2) r = w / 2;
            if (r > h / 2) r = h / 2;
            this.moveTo(x + r, y);
            this.lineTo(x + w - r, y);
            this.quadraticCurveTo(x + w, y, x + w, y + r);
            this.lineTo(x + w, y + h - r);
            this.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
            this.lineTo(x + r, y + h);
            this.quadraticCurveTo(x, y + h, x, y + h - r);
            this.lineTo(x, y + r);
            this.quadraticCurveTo(x, y, x + r, y);
            this.closePath();
            return this;
        };
    }
}

// ============================================================
//  ОТРИСОВКА ТОВАРОВ (Рынок)
// ============================================================
function renderItems(prices) {
    const totalCargo = Object.values(state.cargo).reduce((a, b) => a + b, 0);

    itemsContainer.innerHTML = prices.map(item => {
        const count = state.cargo[item.id] || 0;
        const price = item.price;
        const prevPrice = state.priceHistory[item.id]?.[state.priceHistory[item.id].length - 2]?.price || price;
        const change = price !== null ? price - prevPrice : 0;
        const priceClass = change > 0 ? 'up' : (change < 0 ? 'down' : 'neutral');
        const changeSign = change > 0 ? '▲' : (change < 0 ? '▼' : '—');

        if (price === null) {
            return `<div class="item" style="opacity:0.3">
                        <div class="item-info">
                            <span class="item-name">${item.icon} ${item.name}</span>
                            <span class="item-count">📭 Нет в наличии</span>
                        </div>
                        <div class="item-price-wrap">
                            <span class="item-price neutral">—</span>
                        </div>
                        <div class="item-actions">
                            <button class="btn btn-buy" disabled>Нет</button>
                            <button class="btn btn-sell" disabled>Нет</button>
                        </div>
                    </div>`;
        }

        return `<div class="item">
                    <div class="item-info">
                        <span class="item-name">${item.icon} ${item.name}</span>
                        <span class="item-count">${count} шт.</span>
                    </div>
                    <div class="item-price-wrap">
                        <span class="item-price ${priceClass}">${price}</span>
                        <span class="item-change">${changeSign} ${Math.abs(change)}</span>
                    </div>
                    <div class="item-actions">
                        <button class="btn btn-buy" data-id="${item.id}" data-price="${price}">Купить</button>
                        <button class="btn btn-sell" data-id="${item.id}" data-price="${price}" ${count === 0 ? 'disabled' : ''}>Продать</button>
                    </div>
                </div>`;
    }).join('');

    // Обработчики
    itemsContainer.querySelectorAll('.btn-buy').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const id = btn.dataset.id;
            const price = parseInt(btn.dataset.price);
            buyItem(id, price);
        });
    });

    itemsContainer.querySelectorAll('.btn-sell').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const id = btn.dataset.id;
            const price = parseInt(btn.dataset.price);
            sellItem(id, price);
        });
    });

    // Обновляем мини-статистику
    cashDisplay.textContent = state.cash;
    cargoDisplay.textContent = `${totalCargo}/${state.maxCargo}`;
    tradeCount.textContent = state.totalTrades;
}

// ============================================================
//  ОТРИСОВКА ИНВЕНТАРЯ
// ============================================================
function renderInventory() {
    const totalCargo = Object.values(state.cargo).reduce((a, b) => a + b, 0);
    invTotal.textContent = totalCargo;
    invFree.textContent = state.maxCargo - totalCargo;

    inventoryGrid.innerHTML = ITEMS.map(item => {
        const count = state.cargo[item.id] || 0;
        if (count === 0) {
            return `<div class="inv-item empty">
                        <span class="inv-icon">${item.icon}</span>
                        <div class="inv-name">${item.name}</div>
                        <div class="inv-qty">0</div>
                    </div>`;
        }
        return `<div class="inv-item">
                    <span class="inv-icon">${item.icon}</span>
                    <div class="inv-name">${item.name}</div>
                    <div class="inv-qty">${count}</div>
                </div>`;
    }).join('');
}

// ============================================================
//  ОТРИСОВКА СТАТИСТИКИ
// ============================================================
function renderStats() {
    statEarned.textContent = state.totalEarned;
    statTrades.textContent = state.totalTrades;
    statRisks.textContent = state.totalRisks;
    statBest.textContent = state.bestTrade;

    // Уровень
    let level = LEVELS[0];
    for (let i = LEVELS.length - 1; i >= 0; i--) {
        if (state.totalTrades >= LEVELS[i].min) {
            level = LEVELS[i];
            break;
        }
    }
    levelDisplay.textContent = level.name;

    // Прогресс до следующего уровня
    const currentIdx = LEVELS.indexOf(level);
    const nextLevel = LEVELS[currentIdx + 1];
    if (nextLevel) {
        const progress = (state.totalTrades - level.min) / (nextLevel.min - level.min) * 100;
        levelProgress.style.width = Math.min(100, progress) + '%';
    } else {
        levelProgress.style.width = '100%';
    }
}

// ============================================================
//  ДЕЙСТВИЯ (Покупка/Продажа)
// ============================================================
function buyItem(id, price) {
    const totalCargo = Object.values(state.cargo).reduce((a, b) => a + b, 0);
    if (state.cash < price) {
        showToast('💰 Не хватает денег!');
        return;
    }
    if (totalCargo >= state.maxCargo) {
        showToast('📦 Трюм переполнен!');
        return;
    }
    state.cash -= price;
    state.cargo[id] = (state.cargo[id] || 0) + 1;
    state.totalTrades += 1;
    saveAndRender();
    showToast(`✅ Куплен ${ITEMS.find(i => i.id === id).name}`);
}

function sellItem(id, price) {
    if (!state.cargo[id] || state.cargo[id] <= 0) {
        showToast('❌ Нет товара для продажи');
        return;
    }
    const profit = price;
    state.cargo[id] -= 1;
    state.cash += price;
    state.totalTrades += 1;
    state.totalEarned += profit;
    if (profit > state.bestTrade) state.bestTrade = profit;
    saveAndRender();
    showToast(`💰 Продан ${ITEMS.find(i => i.id === id).name} за ${price}`);
}

// ============================================================
//  РИСК
// ============================================================
function riskAction() {
    const totalCargo = Object.values(state.cargo).reduce((a, b) => a + b, 0);
    if (totalCargo === 0) {
        showToast('📭 Трюм пуст! Сначала купи товар');
        return;
    }

    riskBtn.style.transform = 'scale(0.95)';
    setTimeout(() => riskBtn.style.transform = '', 200);

    state.totalRisks += 1;
    const win = Math.random() > 0.5;

    if (win) {
        for (let key in state.cargo) {
            state.cargo[key] *= 2;
        }
        showToast('🚀 УДАЧА! Груз удвоен! ✨');
    } else {
        state.cargo = {};
        showToast('💥 ПОТЕРЯ! Весь груз уничтожен');
    }
    saveAndRender();
}

// ============================================================
//  ОБНОВЛЕНИЕ ТАЙМЕРА
// ============================================================
function updateTimer() {
    const elapsed = Date.now() - state.lastUpdate;
    const remaining = 180000 - elapsed;
    if (remaining <= 0) {
        timeLabel.textContent = 'Обновление...';
        forceUpdate();
        return;
    }
    const mins = Math.floor(remaining / 60000);
    const secs = Math.floor((remaining % 60000) / 1000);
    timeLabel.textContent = `Обновление через ${mins}:${String(secs).padStart(2, '0')}`;
}

// ============================================================
//  ПРИНУДИТЕЛЬНОЕ ОБНОВЛЕНИЕ
// ============================================================
function forceUpdate() {
    currentPrices = generatePrices();
    updatePriceHistory(currentPrices);
    renderCandles(currentPrices);
    renderItems(currentPrices);
    renderInventory();
    renderStats();
    state.lastUpdate = Date.now();
    localStorage.setItem('trader_v3', JSON.stringify(state));
    updateTimer();
}

// ============================================================
//  БОНУС ЗА ОФФЛАЙН
// ============================================================
function applyOfflineBonus() {
    const diff = (Date.now() - state.lastUpdate) / 1000 / 60;
    if (diff > 3) {
        const bonus = Math.floor(diff * 0.5);
        if (bonus > 0) {
            state.cash += bonus;
            showToast(`⏰ За время отсутствия +${bonus} монет`);
        }
    }
}

// ============================================================
//  СОХРАНЕНИЕ + ОТРИСОВКА
// ============================================================
function saveAndRender() {
    state.lastUpdate = Date.now();
    localStorage.setItem('trader_v3', JSON.stringify(state));
    forceUpdate();
}

// ============================================================
//  ТОСТ
// ============================================================
function showToast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
        toastEl.classList.remove('show');
    }, 2200);
}

// ============================================================
//  ТАБЫ
// ============================================================
function initTabs() {
    const tabs = document.querySelectorAll('.tab');
    const panes = {
        market: document.getElementById('tabMarket'),
        inventory: document.getElementById('tabInventory'),
        stats: document.getElementById('tabStats'),
    };

    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');

            Object.keys(panes).forEach(key => {
                panes[key].classList.remove('active');
            });
            const target = tab.dataset.tab;
            panes[target].classList.add('active');

            // Перерисовываем канвас при переключении на рынок
            if (target === 'market') {
                setTimeout(() => renderCandles(currentPrices), 100);
            }
        });
    });
}

// ============================================================
//  ЗАПУСК
// ============================================================
function init() {
    applyOfflineBonus();
    forceUpdate();

    // Таймер
    setInterval(updateTimer, 1000);
    setInterval(() => {
        forceUpdate();
        showToast('🔄 Рынок обновлён!');
    }, 180000);

    // Кнопка риска
    riskBtn.addEventListener('click', riskAction);

    // Табы
    initTabs();

    // Запрет зума
    document.addEventListener('dblclick', (e) => e.preventDefault());

    // Адаптация канваса при ресайзе
    let resizeTimer;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
            if (document.getElementById('tabMarket').classList.contains('active')) {
                renderCandles(currentPrices);
            }
        }, 200);
    });
}

// Старт
document.addEventListener('DOMContentLoaded', init);
