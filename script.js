'use strict';

/* ═══════════════════════════════════════
   STATE
═══════════════════════════════════════ */
let allProducts  = [];
let cart         = JSON.parse(localStorage.getItem('cyberpc_cart') || '[]');
let currentUser  = null;
let currentSlot  = null;
let viewMode     = 'grid';
let chatOpen     = false;
let chatSession  = 'sess_' + Math.random().toString(36).slice(2);
let selectedStars = 0;

const build = { cpu:null, motherboard:null, gpu:null, ram:null, ssd:null, cooler:null, psu:null, case:null };

const CAT = {
  cpu:'Процессор', motherboard:'Мат. плата', gpu:'Видеокарта',
  ram:'ОП', ssd:'SSD', cooler:'Кулер', psu:'Блок питания', case:'Корпус'
};
const EMO = { cpu:'🖥️', motherboard:'🔌', gpu:'🎮', ram:'💾', ssd:'💿', cooler:'❄️', psu:'⚡', case:'🗂️' };
const CAT_FULL = {
  cpu:'Процессоры', motherboard:'Материнские платы', gpu:'Видеокарты',
  ram:'Оперативная память', ssd:'SSD накопители', cooler:'Кулеры / СВО',
  psu:'Блоки питания', case:'Корпуса'
};

/* ═══════════════════════════════════════
   INIT
═══════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', async () => {
  await checkAuth();
  await loadProducts();
  updateBadge();
  renderHomeProducts();
  renderHomeBuilds();
  showPage('home');

  // Modal overlay click
  document.getElementById('slot-modal').addEventListener('click', e => {
    if (e.target.id === 'slot-modal') closeModal();
  });
  document.getElementById('edit-modal').addEventListener('click', e => {
    if (e.target.id === 'edit-modal') closeEditModal();
  });

  // Chat welcome
  setTimeout(() => addChatMsg('bot', 'Привет! 👋 Я консультант CyberPC. Чем могу помочь?'), 800);
});

/* ═══════════════════════════════════════
   ROUTER
═══════════════════════════════════════ */
function showPage(name) {
  document.querySelectorAll('.page').forEach(p => p.classList.add('hidden'));
  const page = document.getElementById('page-' + name);
  if (!page) return;
  page.classList.remove('hidden');
  window.scrollTo({ top: 0, behavior: 'smooth' });
  const h = { catalog:renderCatalog, cart:renderCart, checkout:renderCheckout,
              builds:renderBuildsPage, profile:renderProfile, admin:renderAdmin,
              contact:()=>{} };
  if (h[name]) h[name]();
}

/* ═══════════════════════════════════════
   AUTH
═══════════════════════════════════════ */
async function checkAuth() {
  try {
    const d = await api('GET', '/api/me');
    currentUser = d.loggedIn ? d : null;
    const lbl = document.getElementById('auth-label');
    const aLink = document.getElementById('admin-link');
    const fAdmin = document.getElementById('f-admin');
    lbl.textContent = d.loggedIn ? d.username : 'Войти';
    if (d.loggedIn && d.role === 'admin') {
      aLink?.classList.remove('hidden');
      fAdmin?.classList.remove('hidden');
    } else {
      aLink?.classList.add('hidden');
      fAdmin?.classList.add('hidden');
    }
  } catch(e) {}
}

async function doLogin() {
  const email = gv('l-email'), pass = gv('l-pass');
  if (!email || !pass) { msg('l-msg','Заполните все поля',true); return; }
  const d = await api('POST','/api/login',{email, password:pass});
  if (d.success) {
    currentUser = d;
    msg('l-msg','✓ Вход выполнен!',false);
    await checkAuth();
    setTimeout(renderProfile, 600);
  } else msg('l-msg', d.message||'Ошибка',true);
}

async function doRegister() {
  const username=gv('r-user'), email=gv('r-email'), password=gv('r-pass'), phone=gv('r-phone');
  if (!username||!email||!password) { msg('r-msg','Заполните обязательные поля',true); return; }
  if (password.length < 6) { msg('r-msg','Пароль минимум 6 символов',true); return; }
  const d = await api('POST','/api/register',{username,email,password,phone});
  if (d.success) {
    currentUser = d;
    msg('r-msg','✓ Аккаунт создан!',false);
    await checkAuth();
    setTimeout(renderProfile, 600);
  } else msg('r-msg', d.message||'Ошибка',true);
}

async function doLogout() {
  await api('POST','/api/logout');
  currentUser = null;
  await checkAuth();
  renderProfile();
  toast('Вы вышли из аккаунта');
}

function switchTab(t) {
  document.querySelectorAll('.atab').forEach((el,i) =>
    el.classList.toggle('active',(t==='login'&&i===0)||(t==='register'&&i===1)));
  document.getElementById('login-form').classList.toggle('hidden', t!=='login');
  document.getElementById('reg-form').classList.toggle('hidden', t!=='register');
}

function renderProfile() {
  const auth = document.getElementById('auth-area');
  const dash = document.getElementById('dash-area');
  if (currentUser && currentUser.loggedIn !== false) {
    auth.classList.add('hidden');
    dash.classList.remove('hidden');
    const n = currentUser.username||'Пользователь';
    const e1=document.getElementById('d-uname'), e2=document.getElementById('d-uname2');
    if(e1) e1.textContent=n; if(e2) e2.textContent=n;
    loadMyOrders();
  } else {
    auth.classList.remove('hidden');
    dash.classList.add('hidden');
  }
}

async function loadMyOrders() {
  const orders = await api('GET','/api/orders/my');
  const el = document.getElementById('my-orders');
  if (!el) return;
  if (!orders.length) { el.innerHTML='<p style="color:var(--t2);font-size:.87rem">Заказов пока нет</p>'; return; }
  el.innerHTML = orders.map(o=>`
    <div class="ord-card">
      <div class="ord-hd">
        <span>Заказ #${String(o._id||o.id).slice(-6)} · ${fmtDate(o.created_at)}</span>
        <span class="ord-st st-${o.status}">${statusLbl(o.status)}</span>
      </div>
      <div style="font-family:var(--fontD);font-size:1.05rem;color:var(--ac)">${fmtP(o.total)}</div>
      <div style="font-size:.75rem;color:var(--t3);margin-top:3px">${o.name} · ${o.phone||''}</div>
    </div>`).join('');
}

/* ═══════════════════════════════════════
   PRODUCTS
═══════════════════════════════════════ */
async function loadProducts() {
  try {
    allProducts = await api('GET','/api/products');
    allProducts = allProducts.map(p=>({...p, id:p._id||p.id}));
  } catch(e) {
    allProducts = [];
    toast('Сервер недоступен — запустите npm start',true);
  }
}

function renderHomeProducts() {
  const el = document.getElementById('home-products');
  if (!el) return;
  // Show popular + top tagged items, max 8
  const feat = allProducts
    .filter(p => p.tags?.some(t=>['popular','top'].includes(t)))
    .slice(0,8);
  const shown = feat.length >= 4 ? feat : allProducts.slice(0,8);
  el.innerHTML = shown.map(p=>pCard(p)).join('');
}

function pCard(p, listMode=false) {
  const id = p._id||p.id;
  const tagHtml = (p.tags||[]).map(t=>`<span class="pc-tag tag-${t}">${tagLabel(t)}</span>`).join('');
  const stockWarn = p.stock > 0 && p.stock <= 3 ? `<div class="stock-low">⚠ Осталось ${p.stock} шт.</div>` : '';
  const cls = listMode ? 'pcard list-view' : 'pcard';
  return `
  <div class="${cls}">
    <div class="pc-img" onclick="showProduct('${id}')">
      <img src="${p.image||''}" alt="${p.name}"
        onerror="this.style.display='none';this.parentElement.innerHTML='<span style=font-size:2.8rem>${EMO[p.category]||'📦'}</span>'">
    </div>
    <div class="pc-body">
      <div class="pc-cat">${CAT_FULL[p.category]||p.category}</div>
      <div class="pc-name" onclick="showProduct('${id}')">${p.name}</div>
      <div class="pc-specs">${p.specs||''}</div>
      ${tagHtml ? `<div class="pc-tags">${tagHtml}</div>` : ''}
      ${stockWarn}
      <div class="pc-foot">
        <span class="pc-price">${fmtP(p.price)}</span>
        <div class="pc-acts">
          <button class="pb pb-g" onclick="showProduct('${id}')">Подробнее</button>
          <button class="pb pb-b" onclick="addToCart('${id}')">+ Купить</button>
        </div>
      </div>
    </div>
  </div>`;
}

function tagLabel(t) {
  return {popular:'Хит',budget:'Бюджет',top:'Топ',gaming:'Gaming','4k':'4K',workstation:'Pro'}[t]||t;
}

function renderCatalog() { applyFilter(); }

function applyFilter() {
  const cat    = document.querySelector('input[name="fcat"]:checked')?.value||'';
  const brand  = document.getElementById('f-brand')?.value||'';
  const minP   = parseFloat(document.getElementById('f-min')?.value)||0;
  const maxP   = parseFloat(document.getElementById('f-max')?.value)||Infinity;
  const sort   = document.getElementById('f-sort')?.value||'price_asc';
  const search = (document.getElementById('f-search')?.value||'').toLowerCase();

  let list = allProducts;
  if (cat)    list = list.filter(p=>p.category===cat);
  if (brand)  list = list.filter(p=>p.brand===brand);
  if (minP)   list = list.filter(p=>p.price>=minP);
  if (maxP!==Infinity) list = list.filter(p=>p.price<=maxP);
  if (search) list = list.filter(p=>p.name.toLowerCase().includes(search)||(p.specs||'').toLowerCase().includes(search));

  if (sort==='price_asc')  list = [...list].sort((a,b)=>a.price-b.price);
  if (sort==='price_desc') list = [...list].sort((a,b)=>b.price-a.price);
  if (sort==='name')       list = [...list].sort((a,b)=>a.name.localeCompare(b.name));

  const el = document.getElementById('catalog-products');
  const cnt = document.getElementById('catalog-count');
  if (cnt) cnt.textContent = `Найдено: ${list.length} товаров`;
  if (el) {
    el.className = viewMode==='list' ? 'pgrid list-view' : 'pgrid';
    el.innerHTML = list.map(p=>pCard(p,viewMode==='list')).join('') ||
      '<p style="color:var(--t2);padding:3rem;grid-column:1/-1">Ничего не найдено. Сбросьте фильтры.</p>';
  }
}

function resetFilters() {
  const r = document.querySelector('input[name="fcat"][value=""]');
  if (r) r.checked=true;
  ['f-brand','f-sort'].forEach(id=>{ const el=document.getElementById(id); if(el) el.value=''; });
  const fsort=document.getElementById('f-sort'); if(fsort) fsort.value='price_asc';
  ['f-min','f-max','f-search'].forEach(id=>{ const el=document.getElementById(id); if(el) el.value=''; });
  applyFilter();
}

function setView(v) {
  viewMode = v;
  document.getElementById('vg-btn').classList.toggle('active', v==='grid');
  document.getElementById('vl-btn').classList.toggle('active', v==='list');
  applyFilter();
}

function filterAndGo(cat) {
  showPage('catalog');
  setTimeout(()=>{
    const r=document.querySelector(`input[name="fcat"][value="${cat}"]`);
    if(r){ r.checked=true; applyFilter(); }
  }, 60);
}

/* Quick search */
function toggleSearch() {
  const qs = document.getElementById('quick-search');
  qs.classList.toggle('hidden');
  if (!qs.classList.contains('hidden')) document.getElementById('qs-input').focus();
}

function quickSearch(q) {
  const el = document.getElementById('qs-results');
  if (!q.trim()) { el.innerHTML=''; return; }
  const found = allProducts.filter(p=>p.name.toLowerCase().includes(q.toLowerCase())).slice(0,6);
  el.innerHTML = found.map(p=>{
    const id=p._id||p.id;
    return `<div class="qs-item" onclick="toggleSearch();showProduct('${id}')">
      <div class="qs-item-img">
        <img src="${p.image||''}" alt="${p.name}" onerror="this.style.display='none';this.parentElement.innerHTML='${EMO[p.category]||'📦'}'">
      </div>
      <div class="qs-item-info">
        <div class="qs-item-name">${p.name}</div>
        <div style="font-size:.74rem;color:var(--t2)">${CAT_FULL[p.category]||''}</div>
      </div>
      <div class="qs-item-price">${fmtP(p.price)}</div>
    </div>`;
  }).join('') || '<div style="padding:1rem;color:var(--t2);font-size:.88rem">Ничего не найдено</div>';
}

/* ═══════════════════════════════════════
   PRODUCT DETAIL
═══════════════════════════════════════ */
async function showProduct(id) {
  // track view
  fetch(`/api/products/${id}/view`, {method:'POST',credentials:'include'}).catch(()=>{});
  const p = await api('GET',`/api/products/${id}`);
  if (!p || !p.name) { toast('Товар не найден',true); return; }
  const pid = p._id||p.id;
  const isAdm = currentUser?.role==='admin';
  const specs = (p.specs||'').split(',').map(s=>`
    <div class="spec-r"><span class="spec-k">Параметр</span><span class="spec-v">${s.trim()}</span></div>`).join('');

  const priceHistory = p.price_history||[];
  const showChart = priceHistory.length >= 2;

  document.getElementById('product-detail-content').innerHTML = `
  <button class="btn-gh" style="margin:2rem 0 1rem" onclick="history.back()">← Назад</button>
  <div class="pd-grid">
    <div class="pd-img-wrap">
      <div class="pd-img" id="pd-img-box">
        <img src="${p.image||''}" alt="${p.name}" id="pd-main-img"
          onerror="this.style.display='none';this.parentElement.innerHTML='<span style=font-size:5rem>${EMO[p.category]||'📦'}</span>'">
      </div>
      ${isAdm ? `<div class="pd-upload">
        <label class="btn-gh" style="cursor:pointer;font-size:.8rem;padding:7px 12px">
          📁 Загрузить фото
          <input type="file" accept="image/*" style="display:none" onchange="uploadProductImage('${pid}',this)">
        </label>
      </div>` : ''}
    </div>
    <div class="pd-info">
      <div class="slbl">${CAT_FULL[p.category]||p.category}</div>
      <div class="pd-name">${p.name}</div>
      <div class="pd-price">${fmtP(p.price)}</div>
      ${p.brand ? `<div style="color:var(--t2);font-size:.9rem">Бренд: <strong style="color:var(--text)">${p.brand}</strong></div>` : ''}
      <div style="font-size:.82rem;color:${p.stock>5?'var(--green)':p.stock>0?'#ffa726':'var(--red)'}">
        ${p.stock>0?`✓ В наличии: ${p.stock} шт.`:'✗ Нет в наличии'}
      </div>
      <div class="pd-specs-box">
        <div class="spec-r"><span class="spec-k">Характеристики</span><span class="spec-v">${p.specs||'—'}</span></div>
        ${p.socket?`<div class="spec-r"><span class="spec-k">Socket</span><span class="spec-v">${p.socket}</span></div>`:''}
        ${p.memory_type?`<div class="spec-r"><span class="spec-k">Тип памяти</span><span class="spec-v">${p.memory_type}</span></div>`:''}
        ${p.tdp?`<div class="spec-r"><span class="spec-k">TDP</span><span class="spec-v">${p.tdp} W</span></div>`:''}
        ${p.wattage?`<div class="spec-r"><span class="spec-k">Мощность БП</span><span class="spec-v">${p.wattage} W</span></div>`:''}
        <div class="spec-r"><span class="spec-k">Просмотры</span><span class="spec-v">${p.views||0}</span></div>
      </div>
      ${p.description?`<div class="pd-desc">${p.description}</div>`:''}
      ${showChart?`<div class="price-chart-sec"><div class="chart-title">📈 История цены</div><canvas id="price-chart" height="80"></canvas></div>`:''}
      <div class="pd-acts">
        <button class="btn-pr" onclick="addToCart('${pid}')">🛒 В корзину</button>
        <button class="btn-ol" onclick="openSlot('${p.category}');selectComponent('${p.category}','${pid}')">⚙ В конфигуратор</button>
      </div>
    </div>
  </div>

  <!-- Reviews -->
  <div class="reviews-sec">
    <div class="slbl">ОТЗЫВЫ</div>
    <h2 class="sh2">Отзывы покупателей</h2>
    ${currentUser&&currentUser.loggedIn ? `
    <div class="fcard" style="margin-bottom:1.5rem;max-width:560px">
      <div class="slbl">ОСТАВИТЬ ОТЗЫВ</div>
      <div class="stars-input" id="stars-input">
        ${[1,2,3,4,5].map(n=>`<button class="star-btn" onclick="setStar(${n},this)" data-n="${n}">★</button>`).join('')}
      </div>
      <div class="fg"><label>Комментарий</label><textarea class="finput" id="rev-text" rows="3" placeholder="Ваш отзыв о товаре..."></textarea></div>
      <button class="btn-pr" onclick="submitReview('${pid}')">Отправить отзыв</button>
      <div class="fmsg" id="rev-msg"></div>
    </div>` : `<p style="color:var(--t2);margin-bottom:1.5rem;font-size:.9rem"><a href="#" onclick="showPage('profile')" style="color:var(--ac)">Войдите</a>, чтобы оставить отзыв</p>`}
    <div id="reviews-list">
      ${(p.reviews||[]).length ? p.reviews.map(rv=>reviewCard(rv)).join('') : '<p style="color:var(--t2);font-size:.87rem">Отзывов пока нет. Будьте первым!</p>'}
    </div>
  </div>`;

  showPage('product');

  // Draw price chart
  if (showChart) {
    setTimeout(()=>{
      const canvas = document.getElementById('price-chart');
      if (!canvas) return;
      const labels = priceHistory.map(h=>fmtDate(h.date));
      const data   = priceHistory.map(h=>h.price);
      new Chart(canvas, {
        type:'line',
        data:{
          labels,
          datasets:[{
            label:'Цена (₸)',
            data,
            borderColor:'#ff4d00',
            backgroundColor:'rgba(255,77,0,.08)',
            borderWidth:2,
            pointRadius:4,
            pointBackgroundColor:'#ff4d00',
            tension:.3,
            fill:true
          }]
        },
        options:{
          responsive:true,
          plugins:{legend:{display:false},tooltip:{callbacks:{label:ctx=>' '+fmtP(ctx.raw)}}},
          scales:{
            x:{grid:{color:'rgba(255,255,255,.04)'},ticks:{color:'#888',font:{size:11}}},
            y:{grid:{color:'rgba(255,255,255,.04)'},ticks:{color:'#888',font:{size:11},callback:v=>fmtP(v)}}
          }
        }
      });
    }, 100);
  }
}

function reviewCard(rv) {
  const stars = '★'.repeat(rv.rating)+'☆'.repeat(5-rv.rating);
  return `<div class="review-card">
    <div class="rev-hd">
      <span class="rev-user">👤 ${rv.username}</span>
      <span class="rev-stars">${stars}</span>
      <span class="rev-date">${fmtDate(rv.created_at)}</span>
    </div>
    ${rv.text?`<div class="rev-text">${rv.text}</div>`:''}
  </div>`;
}

function setStar(n, el) {
  selectedStars = n;
  document.querySelectorAll('.star-btn').forEach(b=>{
    b.classList.toggle('on', parseInt(b.dataset.n)<=n);
  });
}

async function submitReview(productId) {
  if (!selectedStars) { msg('rev-msg','Выберите оценку',true); return; }
  const text = gv('rev-text');
  const d = await api('POST',`/api/products/${productId}/reviews`,{rating:selectedStars,text});
  if (d.success) {
    msg('rev-msg','✓ Отзыв добавлен!',false);
    const list = document.getElementById('reviews-list');
    if (list) list.insertAdjacentHTML('afterbegin', reviewCard(d.review));
    document.getElementById('rev-text').value='';
    selectedStars=0;
    document.querySelectorAll('.star-btn').forEach(b=>b.classList.remove('on'));
  } else msg('rev-msg',d.message||'Ошибка',true);
}

async function uploadProductImage(productId, input) {
  const file = input.files[0];
  if (!file) return;
  const fd = new FormData();
  fd.append('image', file);
  const r = await fetch(`/api/products/${productId}/image`, {method:'POST',body:fd,credentials:'include'});
  const d = await r.json();
  if (d.success) {
    const img = document.getElementById('pd-main-img');
    if (img) { img.src=d.url; img.style.display=''; }
    toast('✓ Фото обновлено!');
  } else toast('Ошибка загрузки',true);
}

/* ═══════════════════════════════════════
   CART
═══════════════════════════════════════ */
function addToCart(id) {
  const p = allProducts.find(x=>(x._id||x.id)===id);
  if (!p) { toast('Товар не найден',true); return; }
  if (p.stock === 0) { toast('Нет в наличии',true); return; }
  const pid = p._id||p.id;
  const ex = cart.find(i=>i.id===pid);
  if (ex) ex.qty=(ex.qty||1)+1;
  else cart.push({id:pid,name:p.name,price:p.price,image:p.image||'',specs:p.specs||'',category:p.category,qty:1});
  saveCart();
  toast(`✓ ${p.name.slice(0,28)}... добавлен в корзину`);
}

function changeQty(id, delta) {
  const item = cart.find(i=>i.id===id);
  if (!item) return;
  item.qty = Math.max(1, (item.qty||1)+delta);
  saveCart(); renderCart();
}

function removeFromCart(id) { cart=cart.filter(i=>i.id!==id); saveCart(); renderCart(); }
function clearCart() { cart=[]; saveCart(); renderCart(); toast('Корзина очищена'); }
function saveCart() { localStorage.setItem('cyberpc_cart',JSON.stringify(cart)); updateBadge(); }
function updateBadge() {
  const n = cart.reduce((a,i)=>a+(i.qty||1),0);
  const el = document.getElementById('cart-badge');
  if (el) el.textContent=n;
}
function cartTotal() { return cart.reduce((a,i)=>a+i.price*(i.qty||1),0); }

function renderCart() {
  const el = document.getElementById('cart-items-list');
  if (!el) return;
  if (!cart.length) {
    el.innerHTML=`<div class="cart-empty"><div class="ico">🛒</div><p style="margin-bottom:1.5rem">Корзина пуста</p><button class="btn-pr" onclick="showPage('catalog')">В каталог</button></div>`;
    document.getElementById('cart-count-txt').textContent='0';
    document.getElementById('cart-total-txt').textContent='0 ₸';
    return;
  }
  el.innerHTML = cart.map(item=>`
    <div class="ci-wrap">
      <div class="ci-img">
        <img src="${item.image}" alt="${item.name}" onerror="this.style.display='none';this.parentElement.innerHTML='<span style=font-size:1.9rem>${EMO[item.category]||'📦'}</span>'">
      </div>
      <div class="ci-info">
        <div class="ci-name">${item.name}</div>
        <div class="ci-specs">${item.specs}</div>
        <div class="ci-qty-ctrl">
          <button class="qty-btn" onclick="changeQty('${item.id}',-1)">−</button>
          <span class="qty-num">${item.qty||1}</span>
          <button class="qty-btn" onclick="changeQty('${item.id}',1)">+</button>
        </div>
      </div>
      <div class="ci-price">${fmtP(item.price*(item.qty||1))}</div>
      <button class="ci-rm" onclick="removeFromCart('${item.id}')">✕ Удалить</button>
    </div>`).join('');
  document.getElementById('cart-count-txt').textContent=cart.reduce((a,i)=>a+(i.qty||1),0);
  document.getElementById('cart-total-txt').textContent=fmtP(cartTotal());
}

function renderCheckout() {
  const el = document.getElementById('co-items');
  if (!el) return;
  el.innerHTML = cart.map(i=>`
    <div class="co-item"><span>${i.name} ×${i.qty||1}</span><span>${fmtP(i.price*(i.qty||1))}</span></div>`).join('');
  const tp = document.getElementById('co-total-price');
  if (tp) tp.textContent=fmtP(cartTotal());
}

async function submitOrder() {
  const name    = gv('o-name'), phone=gv('o-phone');
  const address = gv('o-addr'), email=gv('o-email'), comment=gv('o-comment');
  const payment = document.querySelector('input[name="pay"]:checked')?.value||'card';
  if (!name||!phone) { toast('Заполните имя и телефон',true); return; }
  if (!cart.length)  { toast('Корзина пуста',true); return; }
  const d = await api('POST','/api/orders',{items:cart,total:cartTotal(),payment_method:payment,name,phone,address,comment});
  if (d.success) {
    cart=[]; saveCart();
    toast(`✓ Заказ #${String(d.orderId).slice(-6)} оформлен! Ожидайте звонка`,'ok');
    setTimeout(()=>showPage('home'), 2200);
  } else toast('Ошибка оформления заказа',true);
}

/* ═══════════════════════════════════════
   COMPATIBILITY ENGINE
═══════════════════════════════════════ */
function calcMinPSU() {
  let w = 0;
  if (build.cpu) w += build.cpu.tdp||65;
  if (build.gpu) w += build.gpu.tdp||0;
  w += 80; // system overhead
  return Math.ceil(w * 1.25 / 50) * 50; // round to nearest 50W
}

function checkCompat() {
  const warns=[], oks=[];
  // CPU ↔ Motherboard
  if (build.cpu && build.motherboard) {
    const cs=build.cpu.socket, ms=build.motherboard.socket;
    if (cs && ms && cs!==ms)
      warns.push(`❌ Сокет CPU (${cs}) ≠ плата (${ms})`);
    else oks.push(`✓ Сокет CPU и платы совпадают (${ms||cs})`);
  }
  // Motherboard ↔ RAM
  if (build.motherboard && build.ram) {
    const mbm=build.motherboard.memory_type||'', rm=build.ram.memory_type||'';
    const mb5=mbm.includes('DDR5'), mb4=mbm.includes('DDR4');
    const r5=rm.includes('DDR5'),   r4=rm.includes('DDR4');
    if (mb5&&!mb4&&r4&&!r5) warns.push(`❌ Плата только DDR5, а выбрана DDR4 память`);
    else if (mb4&&!mb5&&r5&&!r4) warns.push(`❌ Плата только DDR4, а выбрана DDR5 память`);
    else oks.push(`✓ Тип памяти совместим (${rm})`);
  }
  // GPU ↔ PSU
  if (build.gpu && build.psu) {
    const need=calcMinPSU(), have=build.psu.wattage||0;
    if (have < need) warns.push(`⚠ БП ${have}W мало. Для этой сборки нужно ≥${need}W`);
    else if (have >= need+200) oks.push(`✓ БП ${have}W — с запасом (нужно ~${need}W)`);
    else oks.push(`✓ БП ${have}W достаточно (нужно ~${need}W)`);
  }
  // PSU hint without GPU
  if (build.cpu && !build.gpu && !build.psu) {
    const need=calcMinPSU();
    warns.push(`ℹ Рекомендуемый БП для этой сборки: от ${need}W`);
  }
  // All slots filled
  const slots=['cpu','motherboard','gpu','ram','ssd','psu','case'];
  if (slots.every(s=>build[s]) && warns.length===0)
    oks.push('🎉 Полностью совместимая сборка!');
  return {warns, oks};
}

function modalIncompat(p) {
  if (p.category==='motherboard' && build.cpu) {
    const cs=build.cpu.socket, ms=p.socket;
    if (cs&&ms&&cs!==ms) return `Сокет ${ms} ≠ CPU ${cs}`;
  }
  if (p.category==='ram' && build.motherboard) {
    const mbm=build.motherboard.memory_type||'', rm=p.memory_type||'';
    if (mbm.includes('DDR5')&&!mbm.includes('DDR4')&&rm.includes('DDR4')&&!rm.includes('DDR5')) return 'Плата требует DDR5';
    if (mbm.includes('DDR4')&&!mbm.includes('DDR5')&&rm.includes('DDR5')&&!rm.includes('DDR4')) return 'Плата требует DDR4';
  }
  if (p.category==='psu') {
    const need=calcMinPSU(), have=p.wattage||0;
    if (have>0&&have<need) return `Мало мощности (нужно ≥${need}W)`;
  }
  return null;
}

/* ═══════════════════════════════════════
   BUILDER
═══════════════════════════════════════ */
function openSlot(slot) {
  currentSlot=slot;
  document.getElementById('modal-title').textContent = CAT_FULL[slot]||slot;
  document.getElementById('modal-cat-label').textContent = 'ВЫБОР КОМПОНЕНТА';
  document.getElementById('modal-search').value='';
  renderModalProducts();
  document.getElementById('slot-modal').classList.remove('hidden');
}

function closeModal() {
  document.getElementById('slot-modal').classList.add('hidden');
  currentSlot=null;
}

function filterModal() { renderModalProducts(); }

function renderModalProducts() {
  const search = document.getElementById('modal-search').value.toLowerCase();
  let list = allProducts.filter(p=>p.category===currentSlot);
  if (search) list=list.filter(p=>p.name.toLowerCase().includes(search)||(p.specs||'').toLowerCase().includes(search));

  const el = document.getElementById('modal-products');
  if (!list.length) { el.innerHTML='<p style="color:var(--t2);padding:1.5rem;grid-column:1/-1">Нет товаров</p>'; return; }

  el.innerHTML = list.map(p=>{
    const pid=p._id||p.id;
    const inc=modalIncompat(p);
    const sel=build[currentSlot]&&(build[currentSlot]._id||build[currentSlot].id)===pid;
    return `
    <div class="mitem ${inc?'incompat':''} ${sel?'msel':''}" onclick="${inc?'':` selectComponent('${currentSlot}','${pid}')`}">
      <div class="mi-name">${p.name}</div>
      <div class="mi-specs">${p.specs||''}</div>
      <div class="mi-price">${fmtP(p.price)}</div>
      ${p.brand?`<div style="font-size:.7rem;color:var(--t3);margin-top:2px">${p.brand}</div>`:''}
      ${inc?`<div class="mi-badge warn">⚠ ${inc}</div>`:''}
      ${sel?`<div class="mi-badge ok">✓ Выбрано</div>`:''}
    </div>`;
  }).join('');
}

function selectComponent(slot, id) {
  const p=allProducts.find(x=>(x._id||x.id)===id);
  if (!p) return;
  build[slot]=p;
  const sEl=document.getElementById('sel-'+slot);
  const stEl=document.getElementById('step-'+slot);
  const clrEl=document.getElementById('clr-'+slot);
  if (sEl) sEl.textContent=p.name;
  if (stEl) stEl.classList.add('sel');
  if (clrEl) clrEl.classList.remove('hidden');
  closeModal();
  updateSummary();
}

function clearSlot(slot) {
  build[slot]=null;
  const sEl=document.getElementById('sel-'+slot);
  const stEl=document.getElementById('step-'+slot);
  const clrEl=document.getElementById('clr-'+slot);
  const defaults={cpu:'Не выбран',motherboard:'Не выбрана',gpu:'Не выбрана',ram:'Не выбрана',ssd:'Не выбран',cooler:'Не выбран',psu:'Не выбран',case:'Не выбран'};
  if (sEl) sEl.textContent=defaults[slot];
  if (stEl) stEl.classList.remove('sel');
  if (clrEl) clrEl.classList.add('hidden');
  updateSummary();
}

function updateSummary() {
  const slots=['cpu','motherboard','gpu','ram','ssd','cooler','psu','case'];
  const filled=slots.filter(s=>build[s]);
  const total=filled.reduce((a,s)=>a+build[s].price,0);

  const itemsEl=document.getElementById('sum-items');
  if (itemsEl) {
    itemsEl.innerHTML=filled.length
      ? filled.map(s=>`<div class="sp-item"><span class="sp-item-k">${CAT[s]}</span><span class="sp-item-p">${fmtP(build[s].price)}</span></div>`).join('')
      : '<div class="sp-empty">Выберите комплектующие</div>';
  }

  const totalEl=document.getElementById('build-total');
  if (totalEl) totalEl.textContent=fmtP(total);

  // PSU recommendation
  const psuHint=document.getElementById('psu-rec');
  if (psuHint) {
    if ((build.cpu||build.gpu)&&!build.psu) {
      psuHint.textContent=`💡 Рекомендуемый БП: от ${calcMinPSU()}W`;
      psuHint.classList.remove('hidden');
    } else psuHint.classList.add('hidden');
  }

  // Compat
  const {warns,oks}=checkCompat();
  const box=document.getElementById('compat-box');
  if (box) box.innerHTML=
    warns.map(w=>`<div class="compat-warn">${w}</div>`).join('')+
    (oks.length?`<div class="compat-ok">${oks.join(' · ')}</div>`:'');
}

function addBuildToCart() {
  const slots=['cpu','motherboard','gpu','ram','ssd','cooler','psu','case'];
  const filled=slots.filter(s=>build[s]);
  if (!filled.length) { toast('Выберите хотя бы один компонент',true); return; }
  const {warns}=checkCompat();
  if (warns.some(w=>w.startsWith('❌'))) {
    if (!confirm('В сборке есть ошибки совместимости. Всё равно добавить в корзину?')) return;
  }
  filled.forEach(s=>addToCart(build[s]._id||build[s].id));
  toast(`✓ ${filled.length} компонент(ов) добавлено в корзину`);
}

async function saveBuild() {
  const slots=['cpu','motherboard','gpu','ram','ssd','cooler','psu','case'];
  const filled=slots.filter(s=>build[s]);
  if (!filled.length) { toast('Сначала выберите комплектующие',true); return; }
  if (!currentUser?.loggedIn) { toast('Войдите в аккаунт',true); showPage('profile'); return; }
  const name=prompt('Название сборки:','Моя сборка '+new Date().toLocaleDateString('ru'))||'Сборка';
  const components={};
  filled.forEach(s=>components[s]=build[s]._id||build[s].id);
  const total=filled.reduce((a,s)=>a+build[s].price,0);
  const d=await api('POST','/api/builds',{name,components,total});
  if (d.success) toast('✓ Сборка сохранена!');
  else toast(d.message||'Ошибка',true);
}

function clearBuild() {
  const slots=['cpu','motherboard','gpu','ram','ssd','cooler','psu','case'];
  slots.forEach(s=>clearSlot(s));
  toast('Сборка сброшена');
}

/* ═══════════════════════════════════════
   BUILDS PAGE
═══════════════════════════════════════ */
async function renderBuildsPage() {
  const el=document.getElementById('builds-page');
  if (!el) return;
  const presets=await api('GET','/api/builds/presets');
  el.innerHTML=presets.map(b=>buildCard(b)).join('')||'<p style="color:var(--t2)">Нет сборок</p>';
  // Draw charts after render
  setTimeout(()=>presets.forEach(b=>drawBuildChart(b)),200);

  // My builds
  if (currentUser?.loggedIn) {
    const myB=await api('GET','/api/builds/my');
    const wrap=document.getElementById('my-builds-wrap');
    const list=document.getElementById('my-builds-list');
    if (myB.length&&wrap&&list) {
      wrap.classList.remove('hidden');
      list.innerHTML=myB.map(b=>buildCard(b,false)).join('');
    }
  }
}

async function renderHomeBuilds() {
  const el=document.getElementById('home-builds');
  if (!el) return;
  try {
    const presets=await api('GET','/api/builds/presets');
    el.innerHTML=presets.map(b=>buildCard(b)).join('');
    setTimeout(()=>presets.forEach(b=>drawBuildChart(b)),300);
  } catch(e){}
}

function buildCard(b) {
  const comps=b.components||{};
  const slots=['cpu','motherboard','gpu','ram','ssd','cooler','psu','case'];
  const rows=slots.map(s=>{
    const id=comps[s];
    const p=id?allProducts.find(x=>(x._id||x.id)===id):null;
    return `<div class="bc-row"><span class="bc-k">${CAT[s]||s}</span><span class="bc-v">${p?p.name:'—'}</span></div>`;
  }).join('');
  const cj=JSON.stringify(JSON.stringify(comps));
  const bid=b._id||b.id;
  const hasPH=(b.price_history||[]).length>=2;
  return `
  <div class="bcard">
    <div class="bc-name">${b.name}</div>
    ${b.description?`<div class="bc-desc">${b.description}</div>`:''}
    ${rows}
    ${hasPH?`<div class="build-chart-wrap"><div class="build-chart-lbl">📈 История цены сборки</div><canvas id="bc-chart-${bid}" height="60"></canvas></div>`:''}
    <div class="bc-foot">
      <div><div style="font-family:var(--fontC);font-size:.68rem;color:var(--t2);letter-spacing:.1em;text-transform:uppercase;margin-bottom:2px">Стоимость</div>
      <span class="bc-price">${fmtP(b.total)}</span></div>
      <div class="bc-acts">
        <button class="btn-pr" style="padding:8px 16px;font-size:.82rem" onclick="loadPreset(${cj})">⚙ Настроить</button>
        <button class="btn-gh" style="padding:8px 16px;font-size:.82rem" onclick="presetCart(${cj})">🛒 В корзину</button>
      </div>
    </div>
  </div>`;
}

function drawBuildChart(b) {
  const ph=b.price_history||[];
  if (ph.length<2) return;
  const bid=b._id||b.id;
  const canvas=document.getElementById('bc-chart-'+bid);
  if (!canvas) return;
  new Chart(canvas,{
    type:'line',
    data:{
      labels:ph.map(h=>fmtDate(h.date)),
      datasets:[{data:ph.map(h=>h.price),borderColor:'#ff4d00',backgroundColor:'rgba(255,77,0,.08)',borderWidth:2,pointRadius:3,pointBackgroundColor:'#ff4d00',tension:.3,fill:true}]
    },
    options:{
      responsive:true,
      plugins:{legend:{display:false},tooltip:{callbacks:{label:ctx=>' '+fmtP(ctx.raw)}}},
      scales:{
        x:{grid:{color:'rgba(255,255,255,.04)'},ticks:{color:'#888',font:{size:10}}},
        y:{grid:{color:'rgba(255,255,255,.04)'},ticks:{color:'#888',font:{size:10},callback:v=>fmtP(v)}}
      }
    }
  });
}

function loadPreset(cj) {
  const comps=JSON.parse(cj);
  clearBuild();
  Object.entries(comps).forEach(([slot,id])=>{
    const p=allProducts.find(x=>(x._id||x.id)===id);
    if (p) selectComponent(slot,p._id||p.id);
  });
  showPage('builder');
  toast('✓ Сборка загружена в конфигуратор');
}

function presetCart(cj) {
  const comps=JSON.parse(cj);
  let n=0;
  Object.values(comps).forEach(id=>{ const p=allProducts.find(x=>(x._id||x.id)===id); if(p){addToCart(p._id||p.id);n++;} });
  toast(`✓ ${n} компонент(ов) добавлено`);
}

/* ═══════════════════════════════════════
   CONTACT FORM
═══════════════════════════════════════ */
function submitContactForm() {
  const name=gv('cf-name'), contact=gv('cf-contact'), msgText=gv('cf-msg');
  const el=document.getElementById('cf-result');
  if (!name||!msgText) { el.textContent='Заполните имя и сообщение'; el.className='fmsg err'; return; }
  el.textContent='✓ Сообщение отправлено! Мы свяжемся с вами в течение 1 часа.';
  el.className='fmsg ok';
  ['cf-name','cf-contact','cf-msg'].forEach(id=>{ const e=document.getElementById(id); if(e) e.value=''; });
}

/* ═══════════════════════════════════════
   CHAT
═══════════════════════════════════════ */
function toggleChat() {
  chatOpen=!chatOpen;
  document.getElementById('chat-window').classList.toggle('hidden',!chatOpen);
}

function addChatMsg(role, text) {
  const el=document.getElementById('chat-msgs');
  if (!el) return;
  const time=new Date().toLocaleTimeString('ru',{hour:'2-digit',minute:'2-digit'});
  el.insertAdjacentHTML('beforeend',`
    <div class="msg ${role}">
      <div class="msg-bubble">${text}</div>
      <div class="msg-time">${time}</div>
    </div>`);
  el.scrollTop=el.scrollHeight;
}

function showTyping() {
  const el=document.getElementById('chat-msgs');
  if (!el) return;
  el.insertAdjacentHTML('beforeend','<div class="chat-typing" id="typing-ind"><div class="typing-dot"></div><div class="typing-dot"></div><div class="typing-dot"></div></div>');
  el.scrollTop=el.scrollHeight;
}

function hideTyping() {
  document.getElementById('typing-ind')?.remove();
}

async function sendChat() {
  const inp=document.getElementById('chat-input');
  const text=(inp.value||'').trim();
  if (!text) return;
  inp.value='';
  addChatMsg('user',text);
  showTyping();
  try {
    const d=await api('POST','/api/chat/message',{message:text,sessionId:chatSession});
    setTimeout(()=>{
      hideTyping();
      if (d.reply) addChatMsg('bot',d.reply);
    }, 600+Math.random()*600);
  } catch(e) {
    hideTyping();
    addChatMsg('bot','Извините, временные технические проблемы. Позвоните нам: +7 (747) 123-45-67');
  }
}

function chatSuggest(text) {
  document.getElementById('chat-input').value=text;
  sendChat();
}

/* ═══════════════════════════════════════
   ADMIN
═══════════════════════════════════════ */
async function renderAdmin() {
  if (!currentUser||currentUser.role!=='admin') { toast('Доступ запрещён',true); showPage('home'); return; }
  const stats=await api('GET','/api/admin/stats');
  const el=document.getElementById('adm-stats');
  if (el) el.innerHTML=`
    <div class="adm-sc"><div class="adm-sn">${stats.users}</div><div class="adm-sl">Пользователей</div></div>
    <div class="adm-sc"><div class="adm-sn">${stats.orders}</div><div class="adm-sl">Заказов</div></div>
    <div class="adm-sc"><div class="adm-sn">${stats.products}</div><div class="adm-sl">Товаров</div></div>
    <div class="adm-sc"><div class="adm-sn">${fmtP(stats.revenue)}</div><div class="adm-sl">Выручка</div></div>`;
  admTab('products');
}

function admTab(tab) {
  document.querySelectorAll('.adm-tab').forEach((t,i)=>t.classList.toggle('active',(i===0&&tab==='products')||(i===1&&tab==='orders')));
  document.getElementById('adm-products').classList.toggle('hidden',tab!=='products');
  document.getElementById('adm-orders').classList.toggle('hidden',tab!=='orders');
  if (tab==='products') loadAdmProducts();
  if (tab==='orders')   loadAdmOrders();
}

async function loadAdmProducts() {
  const products=await api('GET','/api/products');
  const tb=document.getElementById('adm-p-body');
  if (!tb) return;
  tb.innerHTML=products.map(p=>{
    const pid=p._id||p.id;
    const thumb=p.image?`<img src="${p.image}" style="width:46px;height:36px;object-fit:cover;border-radius:3px" onerror="this.style.display='none'">`:`<div style="width:46px;height:36px;background:var(--bg3);border-radius:3px;display:flex;align-items:center;justify-content:center;font-size:1.2rem">${EMO[p.category]||'📦'}</div>`;
    return `<tr>
      <td>${thumb}</td>
      <td><strong>${p.name}</strong></td>
      <td style="color:var(--ac);font-family:var(--fontC);font-size:.75rem;letter-spacing:.08em">${(CAT_FULL[p.category]||p.category).toUpperCase()}</td>
      <td style="font-family:var(--fontD);font-size:1.05rem;color:var(--ac)">${fmtP(p.price)}</td>
      <td style="color:${p.stock>5?'var(--green)':p.stock>0?'#ffa726':'var(--red)'}">${p.stock}</td>
      <td style="display:flex;gap:.4rem;padding:11px 14px;flex-wrap:wrap">
        <button class="btn-gh" style="padding:5px 11px;font-size:.78rem" onclick="openEditModal('${pid}')">✏ Изменить</button>
        <button class="btn-rs" style="padding:5px 11px;font-size:.78rem;color:var(--red);border-color:var(--red)" onclick="delProduct('${pid}')">🗑 Удалить</button>
      </td>
    </tr>`;
  }).join('');
}

async function openEditModal(id) {
  const p=await api('GET',`/api/products/${id}`);
  if (!p?.name) return;
  document.getElementById('ep-id').value    = p._id||p.id;
  document.getElementById('ep-name').value  = p.name;
  document.getElementById('ep-price').value = p.price;
  document.getElementById('ep-brand').value = p.brand||'';
  document.getElementById('ep-stock').value = p.stock||0;
  document.getElementById('ep-socket').value= p.socket||'';
  document.getElementById('ep-mem').value   = p.memory_type||'';
  document.getElementById('ep-tdp').value   = p.tdp||'';
  document.getElementById('ep-watt').value  = p.wattage||'';
  document.getElementById('ep-specs').value = p.specs||'';
  document.getElementById('ep-desc').value  = p.description||'';
  document.getElementById('ep-img').value   = p.image||'';
  document.getElementById('edit-modal').classList.remove('hidden');
}

function closeEditModal() { document.getElementById('edit-modal').classList.add('hidden'); }

async function submitEditProduct() {
  const id=gv('ep-id');
  const body={
    name:gv('ep-name'),    category:'cpu', // will keep existing
    price:parseFloat(gv('ep-price')),
    brand:gv('ep-brand'),  stock:parseInt(gv('ep-stock'))||0,
    socket:gv('ep-socket'),memory_type:gv('ep-mem'),
    tdp:parseInt(gv('ep-tdp'))||null,
    wattage:parseInt(gv('ep-watt'))||null,
    specs:gv('ep-specs'),  description:gv('ep-desc'),
    image:gv('ep-img'),
  };
  // Keep existing category
  const existing=allProducts.find(x=>(x._id||x.id)===id);
  if (existing) body.category=existing.category;

  // Upload image file if selected
  const fileInp=document.getElementById('ep-imgfile');
  if (fileInp?.files[0]) {
    const fd=new FormData();
    fd.append('image',fileInp.files[0]);
    const r=await fetch(`/api/products/${id}/image`,{method:'POST',body:fd,credentials:'include'});
    const d=await r.json();
    if (d.success) body.image=d.url;
  }

  const d=await api('PUT',`/api/products/${id}`,body);
  if (d.success) {
    msg('ep-msg','✓ Сохранено!',false);
    await loadProducts();
    loadAdmProducts();
    setTimeout(closeEditModal, 800);
  } else msg('ep-msg','Ошибка сохранения',true);
}

async function delProduct(id) {
  if (!confirm('Удалить товар?')) return;
  await api('DELETE',`/api/products/${id}`);
  await loadProducts(); loadAdmProducts();
  toast('✓ Товар удалён');
}

function showAddForm() { document.getElementById('adm-add-form').classList.toggle('hidden'); }

async function submitAddProduct() {
  const name=gv('ap-name'), category=document.getElementById('ap-cat')?.value, price=parseFloat(gv('ap-price'));
  if (!name||!category||!price) { msg('ap-msg','Заполните обязательные поля',true); return; }
  let image=gv('ap-img');
  const fileInp=document.getElementById('ap-imgfile');
  if (fileInp?.files[0]) {
    const fd=new FormData(); fd.append('image',fileInp.files[0]);
    const r=await fetch('/api/upload',{method:'POST',body:fd,credentials:'include'});
    const d=await r.json(); if(d.success) image=d.url;
  }
  const body={name,category,price,brand:gv('ap-brand'),specs:gv('ap-specs'),description:gv('ap-desc'),
    image,socket:gv('ap-socket'),memory_type:gv('ap-mem'),
    tdp:parseInt(gv('ap-tdp'))||null,wattage:parseInt(gv('ap-watt'))||null,stock:parseInt(gv('ap-stock'))||10};
  const d=await api('POST','/api/products',body);
  if (d.success) {
    msg('ap-msg','✓ Товар добавлен!',false);
    await loadProducts(); loadAdmProducts();
    document.getElementById('adm-add-form').classList.add('hidden');
  } else msg('ap-msg',d.message||'Ошибка',true);
}

async function loadAdmOrders() {
  const orders=await api('GET','/api/orders');
  const tb=document.getElementById('adm-o-body');
  if (!tb) return;
  tb.innerHTML=orders.map(o=>{
    const oid=o._id||o.id;
    return `<tr>
      <td style="color:var(--t3);font-size:.75rem">#${String(oid).slice(-6)}</td>
      <td><strong>${o.name||'—'}</strong><br><small style="color:var(--t3)">${o.phone||''}</small></td>
      <td style="color:var(--ac);font-family:var(--fontD);font-size:1.1rem">${fmtP(o.total)}</td>
      <td style="font-size:.8rem;color:var(--t2)">${{card:'💳 Карта',kaspi:'🟠 Kaspi',cash:'💵 Наличные'}[o.payment_method]||o.payment_method}</td>
      <td><span class="ord-st st-${o.status}">${statusLbl(o.status)}</span></td>
      <td style="color:var(--t2);font-size:.8rem">${fmtDate(o.created_at)}</td>
      <td>
        <select class="finput" style="width:140px;padding:5px 9px;font-size:.8rem" onchange="updOrderStatus('${oid}',this.value)">
          <option value="pending"    ${o.status==='pending'?'selected':''}>Ожидает</option>
          <option value="processing" ${o.status==='processing'?'selected':''}>В обработке</option>
          <option value="completed"  ${o.status==='completed'?'selected':''}>Выполнен</option>
          <option value="cancelled"  ${o.status==='cancelled'?'selected':''}>Отменён</option>
        </select>
      </td>
    </tr>`;
  }).join('');
}

async function updOrderStatus(id, status) {
  await api('PUT',`/api/orders/${id}/status`,{status});
  toast('✓ Статус обновлён');
}

/* ═══════════════════════════════════════
   UTILS
═══════════════════════════════════════ */
async function api(method, url, body) {
  const opts={method,headers:{'Content-Type':'application/json'},credentials:'include'};
  if (body) opts.body=JSON.stringify(body);
  const r=await fetch(url,opts);
  return r.json();
}
function gv(id) { return (document.getElementById(id)?.value||'').trim(); }
function fmtP(n) { return new Intl.NumberFormat('ru-KZ',{style:'currency',currency:'KZT',minimumFractionDigits:0}).format(n||0); }
function fmtDate(d) { return d?new Date(d).toLocaleDateString('ru-RU',{day:'2-digit',month:'2-digit',year:'numeric'}):'—'; }
function statusLbl(s) { return {pending:'Ожидает',processing:'В обработке',completed:'Выполнен',cancelled:'Отменён'}[s]||s; }
function msg(id, text, isErr) {
  const el=document.getElementById(id);
  if (!el) return;
  el.textContent=text;
  el.className='fmsg '+(isErr?'err':'ok');
}
function toast(text, type='') {
  const el=document.getElementById('toast');
  if (!el) return;
  el.textContent=text;
  el.className='toast '+(type==='ok'?'ok':type===true?'err':'');
  el.classList.remove('hidden');
  clearTimeout(el._t);
  el._t=setTimeout(()=>el.classList.add('hidden'), 3200);
}
