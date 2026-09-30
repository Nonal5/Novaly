// ======= STATE =======
let coins = 2850;
let currentMode = 'Poker';
let matchingTimer = null;
let shopCategory = 'skins';

const shopItems = {
  skins: [
    { name: 'Shadow Deck', desc: 'Dark obsidian card backs', icon: 'heart', rarity: 'common', price: 400, owned: true },
    { name: 'Royal Gold', desc: 'Gilded premium finish', icon: 'sparkles', rarity: 'epic', price: 1200, owned: false },
    { name: 'Dragon Scale', desc: 'Legendary red dragon theme', icon: 'flame', rarity: 'legendary', price: 2500, owned: false },
    { name: 'Cyber Neon', desc: 'Futuristic holographic look', icon: 'heart', rarity: 'rare', price: 800, owned: false },
  ],
  avatars: [
    { name: 'The Phantom', desc: 'Mysterious masked player', icon: 'venetian-mask', rarity: 'rare', price: 600, owned: false },
    { name: 'Wolf Lord', desc: 'Loup-Garou champion skin', icon: 'paw-print', rarity: 'legendary', price: 2000, owned: false },
    { name: 'Poker King', desc: 'Classic card shark look', icon: 'crown', rarity: 'epic', price: 1400, owned: false },
    { name: 'Shadow Agent', desc: 'Undercover specialist', icon: 'user-search', rarity: 'rare', price: 700, owned: false },
  ],
  emotes: [
    { name: 'Big Brain', desc: 'Show off your galaxy brain play', icon: 'brain', rarity: 'common', price: 200, owned: false },
    { name: 'L + Ratio', desc: 'For when you eliminate someone', icon: 'skull', rarity: 'rare', price: 450, owned: false },
    { name: 'GG EZ', desc: 'For true clutch wins only', icon: 'glasses', rarity: 'epic', price: 900, owned: true },
    { name: 'Tilt Meter', desc: 'Watch them tilt', icon: 'angry', rarity: 'common', price: 250, owned: false },
  ],
  packs: [
    { name: 'Starter Bundle', desc: '5 skins + avatar + 500 coins', icon: 'package', rarity: 'rare', price: 1500, owned: false },
    { name: 'Wolf Pack', desc: 'All Loup-Garou content + bonus', icon: 'moon', rarity: 'legendary', price: 4000, owned: false },
    { name: 'Clutch Season 1', desc: 'Exclusive S1 commemoration pack', icon: 'trophy', rarity: 'legendary', price: 6000, owned: false },
    { name: 'Emote Bundle', desc: 'All 8 emotes discounted 30%', icon: 'laugh', rarity: 'epic', price: 1800, owned: false },
  ]
};

// ======= SCREENS =======
function goScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  if (id === 'shopScreen') renderShop();
}

function navTo(screenId, el) {
  goScreen(screenId);
  const nav = el.closest('.bottomnav');
  if(nav) {
    nav.querySelectorAll('.bnav-item').forEach(i => i.classList.remove('active'));
    el.classList.add('active');
  }
}

// ======= STARS =======
function makeStars() {
  const c = document.getElementById('menuStars');
  if(!c) return;
  for(let i=0; i<60; i++) {
    const s = document.createElement('div');
    s.className = 'star';
    const sz = Math.random()*2+0.5;
    s.style.cssText = `width:${sz}px;height:${sz}px;left:${Math.random()*100}%;top:${Math.random()*100}%;animation-delay:${Math.random()*3}s;animation-duration:${2+Math.random()*3}s`;
    c.appendChild(s);
  }
}

// ======= GAME MODE SELECT =======
function selectMode(el, name) {
  document.querySelectorAll('.game-mode-card').forEach(c => c.classList.remove('selected'));
  el.classList.add('selected');
  currentMode = name;
  showToast('Mode: ' + name);
}

// ======= TOGGLE BTNS =======
function toggleBtns(el) {
  const grp = el.closest('.toggle-group');
  grp.querySelectorAll('.toggle-btn').forEach(b => b.classList.remove('active'));
  el.classList.add('active');
}

// ======= MATCHING =======
function startMatching() {
  document.getElementById('matchingModeName').textContent = currentMode.toUpperCase() + ' — RANKED';
  document.getElementById('matchingOverlay').classList.add('active');
  matchingTimer = setTimeout(closeMatching, 8000);
}

function closeMatching() {
  document.getElementById('matchingOverlay').classList.remove('active');
  if(matchingTimer) { clearTimeout(matchingTimer); matchingTimer = null; }
}

// ======= SHOP =======
function shopTab(el, cat) {
  document.querySelectorAll('#shopTabs .shop-tab').forEach(t => t.classList.remove('active'));
  el.classList.add('active');
  shopCategory = cat;
  renderShop();
}

function renderShop() {
  const grid = document.getElementById('shopGrid');
  const items = shopItems[shopCategory] || [];
  grid.innerHTML = items.map((item,i) => `
    <div class="shop-item ${item.rarity}">
      <div class="shop-item-preview">
        <span class="rarity-tag rarity-${item.rarity}">${item.rarity.toUpperCase()}</span>
        ${item.owned ? '<span class="owned-tag">OWNED</span>' : ''}
        <span style="filter: none">${icone(item.icon)}</span>
      </div>
      <div class="shop-item-info">
        <div class="shop-item-name">${item.name}</div>
        <div class="shop-item-desc">${item.desc}</div>
        <div class="shop-item-price">
          <div class="price-tag">${icone('coins')} ${item.price.toLocaleString()}</div>
          <button class="btn-buy" ${item.owned ? 'disabled' : ''} onclick="buyItem(${i},'${shopCategory}')">
            ${item.owned ? 'OWNED' : 'BUY'}
          </button>
        </div>
      </div>
    </div>
  `).join('');
}

function buyItem(idx, cat) {
  const item = shopItems[cat][idx];
  if(item.owned) return;
  if(coins < item.price) {
    showToast('Not enough coins!', 'erreur');
    return;
  }
  coins -= item.price;
  item.owned = true;
  document.getElementById('coinsShop').textContent = coins.toLocaleString();
  document.getElementById('coinsDisplay').textContent = coins.toLocaleString();
  showToast(item.name + ' unlocked!', 'succes');
  renderShop();
}

// ======= TOAST =======
// Notifications en haut de l'écran (notifications.js)
function showToast(msg, type) {
  notifier(msg, { type: type || 'info' });
}

// ======= INIT =======
makeStars();
renderShop();
