'use strict';
const express       = require('express');
const session       = require('express-session');
const bcrypt        = require('bcryptjs');
const cors          = require('cors');
const path          = require('path');
const fs            = require('fs');
const multer        = require('multer');
const Datastore     = require('@seald-io/nedb');

const app  = express();
const PORT = process.env.PORT || 3000;

/* ─── DIRS ──────────────────────────────────────────────────── */
['data','public/uploads'].forEach(d => {
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
});

/* ─── DB ────────────────────────────────────────────────────── */
const db = {
  users:    new Datastore({ filename:'./data/users.db',    autoload:true }),
  products: new Datastore({ filename:'./data/products.db', autoload:true }),
  orders:   new Datastore({ filename:'./data/orders.db',   autoload:true }),
  builds:   new Datastore({ filename:'./data/builds.db',   autoload:true }),
  chat:     new Datastore({ filename:'./data/chat.db',     autoload:true }),
  reviews:  new Datastore({ filename:'./data/reviews.db',  autoload:true }),
};

/* ─── DB HELPERS ────────────────────────────────────────────── */
const q   = (col, query={}, sort={}) => new Promise((res,rej) => {
  let c = col.find(query);
  if (Object.keys(sort).length) c = c.sort(sort);
  c.exec((e,d) => e ? rej(e) : res(d));
});
const q1  = (col, query)    => new Promise((res,rej) => col.findOne(query, (e,d) => e?rej(e):res(d)));
const ins = (col, doc)      => new Promise((res,rej) => col.insert(doc,    (e,d) => e?rej(e):res(d)));
const upd = (col, query, u, opt={}) => new Promise((res,rej) => col.update(query, u, opt, (e,d) => e?rej(e):res(d)));
const del = (col, query)    => new Promise((res,rej) => col.remove(query, {multi:true}, (e,d) => e?rej(e):res(d)));
const cnt = (col, query={}) => new Promise((res,rej) => col.count(query,  (e,d) => e?rej(e):res(d)));

/* ─── FILE UPLOAD ───────────────────────────────────────────── */
const storage = multer.diskStorage({
  destination: (req,file,cb) => cb(null, 'public/uploads/'),
  filename:    (req,file,cb) => cb(null, Date.now() + path.extname(file.originalname)),
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req,file,cb) => {
    if (/image\/(jpeg|png|webp|gif)/.test(file.mimetype)) cb(null,true);
    else cb(new Error('Только изображения'));
  }
});

/* ─── MIDDLEWARE ────────────────────────────────────────────── */
app.use(cors({ origin:true, credentials:true }));
app.use(express.json());
app.use(express.urlencoded({ extended:true }));
app.use(express.static(path.join(__dirname,'public')));
app.use('/uploads', express.static(path.join(__dirname,'public/uploads')));
app.use(session({
  secret: 'cyberpc_kz_secret_2024',
  resave: false,
  saveUninitialized: false,
  cookie: { secure:false, maxAge: 7*24*60*60*1000 }
}));
// Serve index.html from root
app.use(express.static(path.join(__dirname)));

/* ─── AUTH ──────────────────────────────────────────────────── */
app.get ('/api/me', (req,res) => {
  if (req.session.userId) res.json({ loggedIn:true, username:req.session.username, role:req.session.role, userId:req.session.userId });
  else res.json({ loggedIn:false });
});

app.post('/api/register', async (req,res) => {
  const { username, email, password, phone } = req.body;
  if (!username||!email||!password) return res.json({ success:false, message:'Заполните все поля' });
  try {
    const exists = await q1(db.users, { $or:[{email},{username}] });
    if (exists) return res.json({ success:false, message:'Логин или email уже занят' });
    const hash = await bcrypt.hash(password, 10);
    const user = await ins(db.users, { username, email, password:hash, phone:phone||'', role:'user', avatar:'', created_at:new Date() });
    req.session.userId   = user._id;
    req.session.username = user.username;
    req.session.role     = user.role;
    res.json({ success:true, username:user.username, role:user.role });
  } catch(e) { res.json({ success:false, message:e.message }); }
});

app.post('/api/login', async (req,res) => {
  const { email, password } = req.body;
  try {
    const user = await q1(db.users, { $or:[{email},{username:email}] });
    if (!user) return res.json({ success:false, message:'Пользователь не найден' });
    const ok = await bcrypt.compare(password, user.password);
    if (!ok)   return res.json({ success:false, message:'Неверный пароль' });
    req.session.userId   = user._id;
    req.session.username = user.username;
    req.session.role     = user.role;
    res.json({ success:true, username:user.username, role:user.role });
  } catch(e) { res.json({ success:false, message:e.message }); }
});

app.post('/api/logout', (req,res) => { req.session.destroy(); res.json({ success:true }); });

/* ─── PRODUCTS ──────────────────────────────────────────────── */
app.get('/api/products', async (req,res) => {
  const { category, search, brand, minPrice, maxPrice, sort } = req.query;
  const query = {};
  if (category)           query.category = category;
  if (brand)              query.brand    = new RegExp(brand,'i');
  if (search)             query.name     = new RegExp(search,'i');
  if (minPrice||maxPrice) query.price    = {};
  if (minPrice)           query.price.$gte = parseFloat(minPrice);
  if (maxPrice)           query.price.$lte = parseFloat(maxPrice);
  const sortMap = { price_asc:{price:1}, price_desc:{price:-1}, name:{name:1} };
  const sortQ = sortMap[sort] || { price:1 };
  const products = await q(db.products, query, sortQ);
  res.json(products.map(p => ({ ...p, id:p._id })));
});

app.get('/api/products/:id', async (req,res) => {
  const p = await q1(db.products, { _id:req.params.id });
  if (!p) return res.status(404).json({ message:'Not found' });
  // get reviews
  const reviews = await q(db.reviews, { productId:req.params.id }, { created_at:-1 });
  res.json({ ...p, id:p._id, reviews });
});

const isAdmin = (req,res,next) => req.session.role==='admin' ? next() : res.status(403).json({ message:'Forbidden' });
const isAuth  = (req,res,next) => req.session.userId         ? next() : res.status(401).json({ message:'Unauthorized' });

app.post('/api/products', isAdmin, async (req,res) => {
  const { name,category,price,image,specs,description,brand,socket,chipset,memory_type,tdp,wattage,stock,tags } = req.body;
  if (!name||!category||!price) return res.json({ success:false, message:'Заполните обязательные поля' });
  const p = await ins(db.products, {
    name, category, price:parseFloat(price),
    image:image||'', specs:specs||'', description:description||'',
    brand:brand||'', socket:socket||null, chipset:chipset||null,
    memory_type:memory_type||null, tdp:tdp?parseInt(tdp):null,
    wattage:wattage?parseInt(wattage):null,
    stock:parseInt(stock)||10,
    tags:tags||[],
    views:0,
    price_history:[{ price:parseFloat(price), date:new Date() }],
    created_at:new Date()
  });
  res.json({ success:true, id:p._id });
});

app.put('/api/products/:id', isAdmin, async (req,res) => {
  const { name,category,price,image,specs,description,brand,socket,chipset,memory_type,tdp,wattage,stock,tags } = req.body;
  // save price to history if changed
  const existing = await q1(db.products, { _id:req.params.id });
  const history  = existing?.price_history || [];
  if (existing && parseFloat(price) !== existing.price) {
    history.push({ price:parseFloat(price), date:new Date() });
  }
  await upd(db.products, { _id:req.params.id }, { $set:{
    name, category, price:parseFloat(price), image:image||'',
    specs:specs||'', description:description||'', brand:brand||'',
    socket:socket||null, chipset:chipset||null, memory_type:memory_type||null,
    tdp:tdp?parseInt(tdp):null, wattage:wattage?parseInt(wattage):null,
    stock:parseInt(stock)||0, tags:tags||[], price_history:history
  }});
  res.json({ success:true });
});

app.delete('/api/products/:id', isAdmin, async (req,res) => {
  await del(db.products, { _id:req.params.id });
  res.json({ success:true });
});

// Upload image for product
app.post('/api/products/:id/image', isAdmin, upload.single('image'), async (req,res) => {
  if (!req.file) return res.json({ success:false, message:'Файл не загружен' });
  const url = '/uploads/' + req.file.filename;
  await upd(db.products, { _id:req.params.id }, { $set:{ image:url } });
  res.json({ success:true, url });
});

// Upload image standalone (returns url)
app.post('/api/upload', isAdmin, upload.single('image'), (req,res) => {
  if (!req.file) return res.json({ success:false });
  res.json({ success:true, url:'/uploads/'+req.file.filename });
});

// Track product view
app.post('/api/products/:id/view', async (req,res) => {
  await upd(db.products, { _id:req.params.id }, { $inc:{ views:1 } });
  res.json({ success:true });
});

/* ─── REVIEWS ───────────────────────────────────────────────── */
app.post('/api/products/:id/reviews', isAuth, async (req,res) => {
  const { rating, text } = req.body;
  if (!rating) return res.json({ success:false, message:'Укажите оценку' });
  const rev = await ins(db.reviews, {
    productId: req.params.id,
    userId:    req.session.userId,
    username:  req.session.username,
    rating:    parseInt(rating),
    text:      text||'',
    created_at:new Date()
  });
  res.json({ success:true, review:{ ...rev, id:rev._id } });
});

/* ─── ORDERS ────────────────────────────────────────────────── */
app.post('/api/orders', async (req,res) => {
  const { items, total, payment_method, name, phone, address, comment } = req.body;
  if (!items?.length) return res.json({ success:false, message:'Корзина пуста' });
  const order = await ins(db.orders, {
    user_id: req.session.userId||null,
    items, total, payment_method:payment_method||'card',
    name, phone, address, comment:comment||'',
    status:'pending', created_at:new Date()
  });
  res.json({ success:true, orderId:order._id });
});

app.get('/api/orders/my', isAuth, async (req,res) => {
  const orders = await q(db.orders, { user_id:req.session.userId }, { created_at:-1 });
  res.json(orders.map(o => ({ ...o, id:o._id })));
});

app.get('/api/orders', isAdmin, async (req,res) => {
  const orders = await q(db.orders, {}, { created_at:-1 });
  res.json(orders.map(o => ({ ...o, id:o._id })));
});

app.put('/api/orders/:id/status', isAdmin, async (req,res) => {
  await upd(db.orders, { _id:req.params.id }, { $set:{ status:req.body.status } });
  res.json({ success:true });
});

/* ─── BUILDS ────────────────────────────────────────────────── */
app.get('/api/builds/presets', async (req,res) => {
  const builds = await q(db.builds, { is_preset:true }, { created_at:1 });
  res.json(builds.map(b => ({ ...b, id:b._id })));
});

app.post('/api/builds', isAuth, async (req,res) => {
  const { name, components, total } = req.body;
  const b = await ins(db.builds, { user_id:req.session.userId, name, components, total, is_preset:false, created_at:new Date() });
  res.json({ success:true, id:b._id });
});

app.get('/api/builds/my', isAuth, async (req,res) => {
  const builds = await q(db.builds, { user_id:req.session.userId, is_preset:false }, { created_at:-1 });
  res.json(builds.map(b => ({ ...b, id:b._id })));
});

app.delete('/api/builds/:id', isAuth, async (req,res) => {
  await del(db.builds, { _id:req.params.id, user_id:req.session.userId });
  res.json({ success:true });
});

/* ─── CHAT (AI Bot) ─────────────────────────────────────────── */
const BOT_RESPONSES = {
  greet: ['Привет! 👋 Я консультант CyberPC. Чем могу помочь? Могу помочь с выбором комплектующих, оформлением заказа или ответить на вопросы по сборке ПК!', 'Здравствуйте! Добро пожаловать в CyberPC 🖥️ Рад помочь с выбором игрового ПК!'],
  gpu:   ['Для игр в 1080p отлично подойдёт RTX 4060 или RX 7600. Для 1440p — RTX 4070. Для 4K — RTX 4080 или RX 7900 XTX 🎮', 'Видеокарта — ключевой компонент для игр! В нашем каталоге есть GPU от NVIDIA и AMD на любой бюджет.'],
  cpu:   ['AMD Ryzen и Intel Core — оба отличных выбора. Ryzen 7 7700X отлично подходит для игр и работы. Intel i7-13700K тоже очень хорош 💪', 'Для игрового ПК подойдёт любой из наших процессоров. Разница в производительности минимальна в современных играх.'],
  ram:   ['Для игрового ПК рекомендуем минимум 32GB DDR5. Это обеспечит плавную работу в играх и многозадачность 💾', 'DDR5 — новый стандарт. Наши платы на AM5 и LGA1700 поддерживают DDR5. Берите от 32GB.'],
  price: ['У нас есть сборки от 470 000 ₸ до 1 600 000 ₸ 💰 Можем подобрать конфигурацию под ваш бюджет!', 'Используйте наш конфигуратор чтобы собрать ПК точно в рамках бюджета!'],
  delivery: ['Доставляем по Алматы в течение 1-2 дней. По Казахстану — 3-5 дней 📦 Самовывоз из офиса возможен!', 'Доставка по Алматы: 1-2 дня. КТЖ экспресс по РК — 3-5 дней. Стоимость уточним при оформлении заказа.'],
  warranty: ['На все комплектующие даём гарантию 1-2 года 🛡️ При проблемах — бесплатный ремонт или замена!', 'Гарантия от производителя + наша гарантия обслуживания. Обращайтесь — поможем решить любую проблему!'],
  contact: ['Звоните: +7 (747) 123-45-67 📞 WhatsApp/Telegram: @CyberPC_KZ Instagram: @cyberpc.kz', 'Наш офис: Алматы, ул. Абая 150. Режим работы: пн-сб 10:00–20:00 📍'],
  builder: ['Используйте наш конфигуратор ПК! Нажмите "⚡ Конфигуратор" в меню — выберите комплектующие и система проверит совместимость автоматически 🔧', 'Конфигуратор умеет проверять: совместимость сокетов CPU/MB, типы памяти DDR4/DDR5, достаточность мощности БП для видеокарты.'],
  default: ['Отличный вопрос! 😊 Уточните пожалуйста — я помогу с выбором комплектующих, расскажу о ценах, доставке или гарантии.', 'Я онлайн-консультант CyberPC! Спросите про: видеокарты, процессоры, память, доставку, гарантию или помощь с конфигуратором 🖥️']
};

function getBotResponse(msg) {
  const m = msg.toLowerCase();
  if (/привет|здравствуй|добрый|салем|hello|hi/.test(m))          return rnd(BOT_RESPONSES.greet);
  if (/gpu|видеокарт|rtx|rx |gtx|geforce|radeon/.test(m))         return rnd(BOT_RESPONSES.gpu);
  if (/cpu|процессор|ryzen|intel|core i/.test(m))                  return rnd(BOT_RESPONSES.cpu);
  if (/ram|память|ddr|оперативн/.test(m))                          return rnd(BOT_RESPONSES.ram);
  if (/цен|стоим|бюджет|дорог|дешев|сколько/.test(m))             return rnd(BOT_RESPONSES.price);
  if (/доставк|привез|отправ|курьер/.test(m))                      return rnd(BOT_RESPONSES.delivery);
  if (/гарант|сломал|ремонт|возврат/.test(m))                      return rnd(BOT_RESPONSES.warranty);
  if (/контакт|телефон|звонок|адрес|офис|instagram|insta/.test(m)) return rnd(BOT_RESPONSES.contact);
  if (/конфигурат|собрать|сборк|совместим/.test(m))                return rnd(BOT_RESPONSES.builder);
  return rnd(BOT_RESPONSES.default);
}

function rnd(arr) { return arr[Math.floor(Math.random()*arr.length)]; }

app.post('/api/chat/message', async (req,res) => {
  const { message, sessionId } = req.body;
  if (!message?.trim()) return res.json({ success:false });
  // Save user message
  await ins(db.chat, { sessionId, role:'user', text:message, created_at:new Date() });
  // Bot reply with delay simulation
  const botText = getBotResponse(message);
  await ins(db.chat, { sessionId, role:'bot', text:botText, created_at:new Date() });
  res.json({ success:true, reply:botText });
});

app.get('/api/chat/history/:sessionId', async (req,res) => {
  const msgs = await q(db.chat, { sessionId:req.params.sessionId }, { created_at:1 });
  res.json(msgs.map(m => ({ ...m, id:m._id })));
});

/* ─── ADMIN STATS ───────────────────────────────────────────── */
app.get('/api/admin/stats', isAdmin, async (req,res) => {
  const [users,orders,products,builds] = await Promise.all([
    cnt(db.users), cnt(db.orders), cnt(db.products), cnt(db.builds,{is_preset:false})
  ]);
  const allOrders = await q(db.orders, { status:{ $ne:'cancelled' } });
  const revenue   = allOrders.reduce((a,o) => a+(o.total||0), 0);
  // recent orders
  const recent = await q(db.orders, {}, { created_at:-1 });
  res.json({ users, orders, products, builds, revenue, recent:recent.slice(0,5) });
});

/* ─── SEED ──────────────────────────────────────────────────── */
async function seed() {
  // Admin user
  const adminExists = await q1(db.users, { email:'admin@cyberpc.kz' });
  if (!adminExists) {
    const hash = await bcrypt.hash('admin123', 10);
    await ins(db.users, { username:'admin', email:'admin@cyberpc.kz', password:hash, phone:'+7 747 123-45-67', role:'admin', avatar:'', created_at:new Date() });
    console.log('✅ Admin created: admin@cyberpc.kz / admin123');
  }
  const count = await cnt(db.products);
  if (count > 0) return;

  const now = new Date();
  const ph  = (p) => [{ price:p, date:now }]; // price history
  const products = [
    // ─── CPUs ───────────────────────────────────────────────────────
    { name:'AMD Ryzen 5 7600X',      category:'cpu', price:89990,  brand:'AMD',   socket:'AM5',    memory_type:'DDR5',     tdp:105, wattage:null, specs:'6 ядер / 12 потоков, 4.7-5.3 GHz, TDP 105W', description:'Отличный процессор для игрового ПК среднего класса. Архитектура Zen 4.', image:'https://placehold.co/400x300/111/ff4d00?text=Ryzen+5+7600X',  stock:12, tags:['gaming','popular'], views:0, price_history:ph(89990),  created_at:now },
    { name:'AMD Ryzen 7 7700X',      category:'cpu', price:139990, brand:'AMD',   socket:'AM5',    memory_type:'DDR5',     tdp:105, wattage:null, specs:'8 ядер / 16 потоков, 4.5-5.4 GHz, TDP 105W', description:'Мощный 8-ядерный процессор для геймеров и стримеров.',       image:'https://placehold.co/400x300/111/ff4d00?text=Ryzen+7+7700X',  stock:8,  tags:['gaming'],          views:0, price_history:ph(139990), created_at:now },
    { name:'AMD Ryzen 9 7950X',      category:'cpu', price:289990, brand:'AMD',   socket:'AM5',    memory_type:'DDR5',     tdp:170, wattage:null, specs:'16 ядер / 32 потока, 4.5-5.7 GHz, TDP 170W', description:'Флагман для рабочих станций. 3D-рендеринг, видеомонтаж.',     image:'https://placehold.co/400x300/111/ff4d00?text=Ryzen+9+7950X',  stock:4,  tags:['workstation'],     views:0, price_history:ph(289990), created_at:now },
    { name:'AMD Ryzen 5 5600X',      category:'cpu', price:59990,  brand:'AMD',   socket:'AM4',    memory_type:'DDR4',     tdp:65,  wattage:null, specs:'6 ядер / 12 потоков, 3.7-4.6 GHz, TDP 65W',  description:'Бюджетный игровой процессор. Отличное соотношение цена/качество.', image:'https://placehold.co/400x300/111/ff4d00?text=Ryzen+5+5600X',  stock:15, tags:['budget'],          views:0, price_history:ph(59990),  created_at:now },
    { name:'AMD Ryzen 7 5800X3D',    category:'cpu', price:129990, brand:'AMD',   socket:'AM4',    memory_type:'DDR4',     tdp:105, wattage:null, specs:'8 ядер / 16 потоков, 3.4-4.5 GHz, 96MB 3D V-Cache', description:'Лучший игровой процессор AM4 благодаря 3D V-Cache.',     image:'https://placehold.co/400x300/111/ff4d00?text=Ryzen+7+5800X3D', stock:6, tags:['gaming','top'],   views:0, price_history:ph(129990), created_at:now },
    { name:'Intel Core i5-13600K',   category:'cpu', price:99990,  brand:'Intel', socket:'LGA1700',memory_type:'DDR4/DDR5',tdp:125, wattage:null, specs:'14 ядер / 20 потоков, до 5.1 GHz, TDP 125W', description:'Универсальный процессор от Intel. Отличен для игр и работы.', image:'https://placehold.co/400x300/111/0080ff?text=i5-13600K',      stock:10, tags:['gaming'],          views:0, price_history:ph(99990),  created_at:now },
    { name:'Intel Core i7-13700K',   category:'cpu', price:159990, brand:'Intel', socket:'LGA1700',memory_type:'DDR4/DDR5',tdp:125, wattage:null, specs:'16 ядер / 24 потока, до 5.4 GHz, TDP 125W', description:'Мощный процессор для геймеров и профессионалов.',            image:'https://placehold.co/400x300/111/0080ff?text=i7-13700K',      stock:8,  tags:['gaming','popular'],views:0, price_history:ph(159990), created_at:now },
    { name:'Intel Core i9-13900K',   category:'cpu', price:299990, brand:'Intel', socket:'LGA1700',memory_type:'DDR4/DDR5',tdp:125, wattage:null, specs:'24 ядра / 32 потока, до 5.8 GHz, TDP 125W', description:'Флагман Intel 13-го поколения. Максимальная производительность.', image:'https://placehold.co/400x300/111/0080ff?text=i9-13900K',  stock:4,  tags:['workstation'],     views:0, price_history:ph(299990), created_at:now },
    { name:'Intel Core i5-12400F',   category:'cpu', price:49990,  brand:'Intel', socket:'LGA1700',memory_type:'DDR4/DDR5',tdp:65,  wattage:null, specs:'6 ядер / 12 потоков, до 4.4 GHz, TDP 65W',  description:'Бюджетный процессор для сборки начального уровня.',          image:'https://placehold.co/400x300/111/0080ff?text=i5-12400F',      stock:18, tags:['budget'],          views:0, price_history:ph(49990),  created_at:now },
    { name:'AMD Ryzen 9 7900X',      category:'cpu', price:219990, brand:'AMD',   socket:'AM5',    memory_type:'DDR5',     tdp:170, wattage:null, specs:'12 ядер / 24 потока, 4.7-5.6 GHz, TDP 170W', description:'12-ядерный флагман на AM5 для серьёзных задач.',             image:'https://placehold.co/400x300/111/ff4d00?text=Ryzen+9+7900X',  stock:5,  tags:['workstation'],     views:0, price_history:ph(219990), created_at:now },
    // ─── Motherboards ────────────────────────────────────────────────
    { name:'ASUS ROG Strix X670E-E', category:'motherboard', price:149990, brand:'ASUS',    socket:'AM5',    memory_type:'DDR5',     tdp:null, wattage:null, specs:'AM5, DDR5, PCIe 5.0, WiFi 6E, 4x M.2, ATX', description:'Топовая плата для AM5. WiFi 6E, 4 слота M.2, PCIe 5.0.', image:'https://placehold.co/400x300/111/ff6b35?text=ROG+X670E',   stock:6, tags:['top'],    views:0, price_history:ph(149990), created_at:now },
    { name:'MSI MEG X670E ACE',      category:'motherboard', price:169990, brand:'MSI',     socket:'AM5',    memory_type:'DDR5',     tdp:null, wattage:null, specs:'AM5, DDR5, PCIe 5.0, 2.5G LAN, 5x M.2',    description:'Премиум плата от MSI для разгона и экстремальных задач.', image:'https://placehold.co/400x300/111/ff6b35?text=MEG+X670E',  stock:4, tags:[],        views:0, price_history:ph(169990), created_at:now },
    { name:'Gigabyte B650M DS3H',    category:'motherboard', price:54990,  brand:'Gigabyte',socket:'AM5',    memory_type:'DDR5',     tdp:null, wattage:null, specs:'AM5, DDR5, PCIe 4.0, 2x M.2, mATX',        description:'Доступная плата AM5 для бюджетных сборок.',              image:'https://placehold.co/400x300/111/ff6b35?text=B650M+DS3H',  stock:14, tags:['budget'], views:0, price_history:ph(54990),  created_at:now },
    { name:'ASUS TUF Gaming B650-Plus', category:'motherboard', price:79990, brand:'ASUS', socket:'AM5',    memory_type:'DDR5',     tdp:null, wattage:null, specs:'AM5, DDR5, PCIe 4.0, WiFi, 4x M.2',        description:'Надёжная плата серии TUF с военными стандартами качества.', image:'https://placehold.co/400x300/111/ff6b35?text=TUF+B650', stock:10, tags:['popular'], views:0, price_history:ph(79990), created_at:now },
    { name:'ASUS ROG Maximus Z790',  category:'motherboard', price:189990, brand:'ASUS',    socket:'LGA1700',memory_type:'DDR5',     tdp:null, wattage:null, specs:'LGA1700, DDR5, PCIe 5.0, WiFi 6E, 5x M.2', description:'Топ для Intel 13-го поколения. Всё что нужно для разгона.', image:'https://placehold.co/400x300/111/ff6b35?text=Z790+Hero',  stock:3, tags:['top'],    views:0, price_history:ph(189990), created_at:now },
    { name:'MSI MAG Z790 Tomahawk',  category:'motherboard', price:89990,  brand:'MSI',     socket:'LGA1700',memory_type:'DDR4/DDR5',tdp:null, wattage:null, specs:'LGA1700, DDR4/DDR5, PCIe 5.0, 2.5G LAN',   description:'Универсальная плата с поддержкой DDR4 и DDR5.',           image:'https://placehold.co/400x300/111/ff6b35?text=Z790+Tomahawk', stock:9, tags:['popular'],views:0, price_history:ph(89990),  created_at:now },
    { name:'Gigabyte B760M Aorus',   category:'motherboard', price:69990,  brand:'Gigabyte',socket:'LGA1700',memory_type:'DDR5',     tdp:null, wattage:null, specs:'LGA1700, DDR5, PCIe 4.0, 3x M.2, mATX',    description:'Компактная mATX плата для Intel с отличным охлаждением VRM.', image:'https://placehold.co/400x300/111/ff6b35?text=B760M+Aorus', stock:11, tags:[],     views:0, price_history:ph(69990),  created_at:now },
    { name:'MSI B450 Tomahawk MAX',  category:'motherboard', price:39990,  brand:'MSI',     socket:'AM4',    memory_type:'DDR4',     tdp:null, wattage:null, specs:'AM4, DDR4, PCIe 3.0, 2x M.2, ATX',          description:'Надёжная плата для AM4 с поддержкой Ryzen 5000.',         image:'https://placehold.co/400x300/111/ff6b35?text=B450+Tomahawk', stock:15, tags:['budget'],views:0, price_history:ph(39990),  created_at:now },
    // ─── GPUs ────────────────────────────────────────────────────────
    { name:'NVIDIA RTX 4060',        category:'gpu', price:149990, brand:'NVIDIA', socket:null, memory_type:null, tdp:165, wattage:null, specs:'8GB GDDR6, 3072 CUDA, DLSS 3, AV1',    description:'Отличная карта для 1080p гейминга. Поддержка DLSS 3 и Frame Generation.', image:'https://placehold.co/400x300/111/76ff03?text=RTX+4060',  stock:10, tags:['popular','gaming'], views:0, price_history:ph(149990), created_at:now },
    { name:'NVIDIA RTX 4060 Ti',     category:'gpu', price:199990, brand:'NVIDIA', socket:null, memory_type:null, tdp:165, wattage:null, specs:'8GB GDDR6, 4352 CUDA, DLSS 3',         description:'Улучшенная версия 4060 с большим числом CUDA-ядер.',                     image:'https://placehold.co/400x300/111/76ff03?text=RTX+4060+Ti', stock:8, tags:['gaming'],          views:0, price_history:ph(199990), created_at:now },
    { name:'NVIDIA RTX 4070',        category:'gpu', price:249990, brand:'NVIDIA', socket:null, memory_type:null, tdp:200, wattage:null, specs:'12GB GDDR6X, 5888 CUDA, DLSS 3',       description:'Идеал для 1440p. Превосходный баланс цены и производительности.',        image:'https://placehold.co/400x300/111/76ff03?text=RTX+4070',  stock:7, tags:['popular','gaming'], views:0, price_history:ph(249990), created_at:now },
    { name:'NVIDIA RTX 4070 Ti',     category:'gpu', price:329990, brand:'NVIDIA', socket:null, memory_type:null, tdp:285, wattage:null, specs:'12GB GDDR6X, 7680 CUDA, DLSS 3',       description:'Мощная карта для 4K-гейминга и трассировки лучей.',                      image:'https://placehold.co/400x300/111/76ff03?text=RTX+4070+Ti', stock:5, tags:['gaming'],          views:0, price_history:ph(329990), created_at:now },
    { name:'NVIDIA RTX 4080',        category:'gpu', price:449990, brand:'NVIDIA', socket:null, memory_type:null, tdp:320, wattage:null, specs:'16GB GDDR6X, 9728 CUDA, DLSS 3',       description:'Флагман для 4K с максимальными настройками. RTX 4080.',                  image:'https://placehold.co/400x300/111/76ff03?text=RTX+4080',  stock:4, tags:['top','4k'],         views:0, price_history:ph(449990), created_at:now },
    { name:'NVIDIA RTX 4090',        category:'gpu', price:699990, brand:'NVIDIA', socket:null, memory_type:null, tdp:450, wattage:null, specs:'24GB GDDR6X, 16384 CUDA, DLSS 3',      description:'Абсолютный флагман. Лучшая видеокарта для 4K и 8K.',                     image:'https://placehold.co/400x300/111/76ff03?text=RTX+4090',  stock:3, tags:['top','4k'],         views:0, price_history:ph(699990), created_at:now },
    { name:'AMD Radeon RX 7600',     category:'gpu', price:119990, brand:'AMD',    socket:null, memory_type:null, tdp:165, wattage:null, specs:'8GB GDDR6, 2048 CU, FSR 3, AV1',      description:'Бюджетная карта AMD для 1080p. Отличная производительность за деньги.',  image:'https://placehold.co/400x300/111/ff4500?text=RX+7600',   stock:12, tags:['budget'],          views:0, price_history:ph(119990), created_at:now },
    { name:'AMD Radeon RX 7700 XT',  category:'gpu', price:189990, brand:'AMD',    socket:null, memory_type:null, tdp:245, wattage:null, specs:'12GB GDDR6, 3456 CU, FSR 3',          description:'Мощная карта для 1440p от AMD. Конкурент RTX 4060 Ti.',                  image:'https://placehold.co/400x300/111/ff4500?text=RX+7700+XT', stock:7, tags:['gaming'],         views:0, price_history:ph(189990), created_at:now },
    { name:'AMD Radeon RX 7900 XTX', category:'gpu', price:399990, brand:'AMD',    socket:null, memory_type:null, tdp:355, wattage:null, specs:'24GB GDDR6, 6144 CU, FSR 3',          description:'Флагман AMD для 4K. 24GB памяти — лучший выбор для VRAM.',              image:'https://placehold.co/400x300/111/ff4500?text=RX+7900+XTX', stock:4, tags:['top','4k'],      views:0, price_history:ph(399990), created_at:now },
    { name:'NVIDIA RTX 3070',        category:'gpu', price:149990, brand:'NVIDIA', socket:null, memory_type:null, tdp:220, wattage:null, specs:'8GB GDDR6, 5888 CUDA, DLSS 2',         description:'Предыдущее поколение по отличной цене. Отлично для 1440p.',             image:'https://placehold.co/400x300/111/76ff03?text=RTX+3070',  stock:6, tags:[],                  views:0, price_history:ph(149990), created_at:now },
    { name:'AMD Radeon RX 6700 XT',  category:'gpu', price:99990,  brand:'AMD',    socket:null, memory_type:null, tdp:230, wattage:null, specs:'12GB GDDR6, 2560 CU, FSR 2',           description:'Предыдущее поколение AMD. 12GB — много памяти для цены.',               image:'https://placehold.co/400x300/111/ff4500?text=RX+6700+XT', stock:8, tags:['budget'],         views:0, price_history:ph(99990),  created_at:now },
    // ─── RAM ─────────────────────────────────────────────────────────
    { name:'Kingston Fury Beast DDR5 32GB', category:'ram', price:49990,  brand:'Kingston', socket:null, memory_type:'DDR5', tdp:null, wattage:null, specs:'DDR5-5200, 2×16GB, CL40, XMP 3.0',    description:'Надёжная DDR5 память с RGB и поддержкой XMP 3.0.',     image:'https://placehold.co/400x300/111/00e5ff?text=DDR5+32GB',    stock:20, tags:['popular'], views:0, price_history:ph(49990),  created_at:now },
    { name:'Corsair Vengeance DDR5 32GB',   category:'ram', price:54990,  brand:'Corsair',  socket:null, memory_type:'DDR5', tdp:null, wattage:null, specs:'DDR5-5600, 2×16GB, CL36, XMP 3.0',    description:'Стильная память Corsair с алюминиевым радиатором.',     image:'https://placehold.co/400x300/111/00e5ff?text=Corsair+DDR5', stock:15, tags:[],          views:0, price_history:ph(54990),  created_at:now },
    { name:'G.Skill Trident Z5 DDR5 32GB', category:'ram', price:64990,  brand:'G.Skill',  socket:null, memory_type:'DDR5', tdp:null, wattage:null, specs:'DDR5-6000, 2×16GB, CL30, XMP 3.0, RGB', description:'Топовая скоростная DDR5 с RGB подсветкой. 6000 МГц.',  image:'https://placehold.co/400x300/111/00e5ff?text=Trident+Z5',   stock:10, tags:['top'],     views:0, price_history:ph(64990),  created_at:now },
    { name:'Corsair Vengeance DDR5 64GB',   category:'ram', price:89990,  brand:'Corsair',  socket:null, memory_type:'DDR5', tdp:null, wattage:null, specs:'DDR5-5600, 2×32GB, CL36, XMP 3.0',    description:'64GB DDR5 для рабочих станций и контент-криэйторов.',   image:'https://placehold.co/400x300/111/00e5ff?text=DDR5+64GB',    stock:8,  tags:['workstation'],views:0, price_history:ph(89990),  created_at:now },
    { name:'Kingston Fury Beast DDR4 32GB', category:'ram', price:29990,  brand:'Kingston', socket:null, memory_type:'DDR4', tdp:null, wattage:null, specs:'DDR4-3600, 2×16GB, CL18, XMP 2.0',    description:'Быстрая DDR4 память для платформы AM4 и LGA1700.',      image:'https://placehold.co/400x300/111/00e5ff?text=DDR4+32GB',    stock:18, tags:['budget'],  views:0, price_history:ph(29990),  created_at:now },
    { name:'G.Skill Ripjaws V DDR4 16GB',   category:'ram', price:14990,  brand:'G.Skill',  socket:null, memory_type:'DDR4', tdp:null, wattage:null, specs:'DDR4-3200, 2×8GB, CL16',               description:'Базовая DDR4 память. Хватит для бюджетного игрового ПК.', image:'https://placehold.co/400x300/111/00e5ff?text=DDR4+16GB',   stock:25, tags:['budget'],  views:0, price_history:ph(14990),  created_at:now },
    { name:'Corsair Dominator DDR5 64GB',   category:'ram', price:119990, brand:'Corsair',  socket:null, memory_type:'DDR5', tdp:null, wattage:null, specs:'DDR5-6200, 2×32GB, CL36, Iridescent RGB', description:'Премиум память с уникальной подсветкой. Вершина DDR5.', image:'https://placehold.co/400x300/111/00e5ff?text=Dominator+DDR5', stock:4, tags:['top'],    views:0, price_history:ph(119990), created_at:now },
    // ─── SSDs ────────────────────────────────────────────────────────
    { name:'Samsung 970 EVO Plus 1TB',  category:'ssd', price:44990, brand:'Samsung',  socket:null, memory_type:null, tdp:null, wattage:null, specs:'NVMe PCIe 3.0×4, 3500/3300 MB/s, M.2 2280', description:'Проверенная временем SSD от Samsung. Надёжность и скорость.', image:'https://placehold.co/400x300/111/ffd700?text=970+EVO+1TB',  stock:20, tags:['popular'], views:0, price_history:ph(44990), created_at:now },
    { name:'Samsung 990 Pro 2TB',       category:'ssd', price:89990, brand:'Samsung',  socket:null, memory_type:null, tdp:null, wattage:null, specs:'NVMe PCIe 4.0×4, 7450/6900 MB/s, M.2 2280', description:'Флагман Samsung. Максимальная скорость PCIe 4.0.',           image:'https://placehold.co/400x300/111/ffd700?text=990+Pro+2TB',  stock:15, tags:['top'],     views:0, price_history:ph(89990), created_at:now },
    { name:'WD Black SN850X 1TB',       category:'ssd', price:54990, brand:'WD',       socket:null, memory_type:null, tdp:null, wattage:null, specs:'NVMe PCIe 4.0×4, 7300/6600 MB/s, M.2 2280', description:'Рекомендованная SSD для PS5. Отличная скорость.',             image:'https://placehold.co/400x300/111/ffd700?text=SN850X+1TB',   stock:12, tags:['gaming'],  views:0, price_history:ph(54990), created_at:now },
    { name:'Seagate FireCuda 530 2TB',  category:'ssd', price:99990, brand:'Seagate',  socket:null, memory_type:null, tdp:null, wattage:null, specs:'NVMe PCIe 4.0×4, 7300/6900 MB/s, M.2 2280', description:'Игровая SSD с теплоотводом. Heatsink edition.',               image:'https://placehold.co/400x300/111/ffd700?text=FireCuda+2TB',  stock:8,  tags:['gaming'],  views:0, price_history:ph(99990), created_at:now },
    { name:'Kingston NV2 1TB',          category:'ssd', price:24990, brand:'Kingston', socket:null, memory_type:null, tdp:null, wattage:null, specs:'NVMe PCIe 4.0×4, 3500/2100 MB/s, M.2 2280', description:'Бюджетная NVMe SSD. Быстрее SATA в 5 раз.',                   image:'https://placehold.co/400x300/111/ffd700?text=NV2+1TB',      stock:25, tags:['budget'],  views:0, price_history:ph(24990), created_at:now },
    { name:'Samsung 870 QVO 2TB',       category:'ssd', price:34990, brand:'Samsung',  socket:null, memory_type:null, tdp:null, wattage:null, specs:'SATA III, 560/530 MB/s, 2.5"',              description:'Бюджетная SATA SSD большого объёма. Для хранения игр.',     image:'https://placehold.co/400x300/111/ffd700?text=870+QVO+2TB',  stock:18, tags:['budget'],  views:0, price_history:ph(34990), created_at:now },
    { name:'WD Black SN850X 4TB',       category:'ssd', price:169990, brand:'WD',      socket:null, memory_type:null, tdp:null, wattage:null, specs:'NVMe PCIe 4.0×4, 7300/6600 MB/s, M.2 2280, 4TB', description:'Огромный объём 4TB с топовой скоростью.',              image:'https://placehold.co/400x300/111/ffd700?text=SN850X+4TB',   stock:5,  tags:['top'],     views:0, price_history:ph(169990), created_at:now },
    // ─── PSUs ────────────────────────────────────────────────────────
    { name:'Seasonic Focus GX-650',    category:'psu', price:44990,  brand:'Seasonic', socket:null, memory_type:null, tdp:null, wattage:650,  specs:'650W, 80+ Gold, Fully Modular',     description:'Тихий и надёжный блок питания. Полностью модульный.',       image:'https://placehold.co/400x300/111/ff9800?text=GX-650W',   stock:12, tags:['popular'], views:0, price_history:ph(44990),  created_at:now },
    { name:'be quiet! Pure Power 750W', category:'psu', price:49990, brand:'be quiet!',socket:null, memory_type:null, tdp:null, wattage:750,  specs:'750W, 80+ Gold, Semi-Modular',      description:'Тихий БП от be quiet! с отличной защитой.',                 image:'https://placehold.co/400x300/111/ff9800?text=PP-750W',   stock:10, tags:[],          views:0, price_history:ph(49990),  created_at:now },
    { name:'Corsair RM850x',           category:'psu', price:64990,  brand:'Corsair',  socket:null, memory_type:null, tdp:null, wattage:850,  specs:'850W, 80+ Gold, Fully Modular',     description:'Отличный выбор для RTX 4070/4080. Надёжный и бесшумный.',    image:'https://placehold.co/400x300/111/ff9800?text=RM850x',    stock:9,  tags:['popular'], views:0, price_history:ph(64990),  created_at:now },
    { name:'Corsair HX1000',           category:'psu', price:89990,  brand:'Corsair',  socket:null, memory_type:null, tdp:null, wattage:1000, specs:'1000W, 80+ Platinum, Fully Modular', description:'1000W для RTX 4090 и мощных систем. 80+ Platinum.',          image:'https://placehold.co/400x300/111/ff9800?text=HX1000',    stock:6,  tags:['top'],     views:0, price_history:ph(89990),  created_at:now },
    { name:'ASUS ROG Thor 1200W',      category:'psu', price:129990, brand:'ASUS',     socket:null, memory_type:null, tdp:null, wattage:1200, specs:'1200W, 80+ Platinum, Modular, OLED', description:'Топ БП с OLED дисплеем для мониторинга потребления.',        image:'https://placehold.co/400x300/111/ff9800?text=Thor+1200W', stock:3,  tags:['top'],     views:0, price_history:ph(129990), created_at:now },
    { name:'Cooler Master MWE 550W',   category:'psu', price:22990,  brand:'Cooler Master', socket:null, memory_type:null, tdp:null, wattage:550, specs:'550W, 80+ Bronze, Semi-Modular', description:'Бюджетный БП для сборок начального уровня.',                image:'https://placehold.co/400x300/111/ff9800?text=MWE-550W',  stock:20, tags:['budget'], views:0, price_history:ph(22990),  created_at:now },
    // ─── Cases ───────────────────────────────────────────────────────
    { name:'Fractal Design Meshify 2', category:'case', price:44990, brand:'Fractal Design', socket:null, memory_type:null, tdp:null, wattage:null, specs:'ATX, Mesh front, 3×140mm fans, TG Side', description:'Отличный airflow. Популярный корпус среди геймеров.',  image:'https://placehold.co/400x300/111/e040fb?text=Meshify+2',  stock:8,  tags:['popular'], views:0, price_history:ph(44990), created_at:now },
    { name:'NZXT H510 Flow',          category:'case', price:34990, brand:'NZXT',           socket:null, memory_type:null, tdp:null, wattage:null, specs:'ATX, Mesh front, 2×120mm fans, TG Side', description:'Стильный корпус с отличной вентиляцией через mesh-панель.', image:'https://placehold.co/400x300/111/e040fb?text=H510+Flow',  stock:10, tags:[],          views:0, price_history:ph(34990), created_at:now },
    { name:'Lian Li PC-O11 Dynamic',  category:'case', price:59990, brand:'Lian Li',        socket:null, memory_type:null, tdp:null, wattage:null, specs:'ATX, Dual Chamber, 3× TG panels',        description:'Эффектный корпус для RGB-сборок. Вид со всех сторон.',       image:'https://placehold.co/400x300/111/e040fb?text=O11+Dynamic', stock:7, tags:['popular'], views:0, price_history:ph(59990), created_at:now },
    { name:'be quiet! Silent Base 802',category:'case', price:64990, brand:'be quiet!',     socket:null, memory_type:null, tdp:null, wattage:null, specs:'E-ATX, Sound Dampening, 3×140mm fans',   description:'Тихий корпус с шумопоглощением. Для бесшумной системы.',    image:'https://placehold.co/400x300/111/e040fb?text=Silent+802', stock:5,  tags:[],          views:0, price_history:ph(64990), created_at:now },
    { name:'Corsair 4000D Airflow',   category:'case', price:39990, brand:'Corsair',        socket:null, memory_type:null, tdp:null, wattage:null, specs:'ATX, Mesh front, 2×120mm fans, TG Side', description:'Хороший airflow за разумные деньги. Модульная компоновка.', image:'https://placehold.co/400x300/111/e040fb?text=4000D',      stock:12, tags:['popular'], views:0, price_history:ph(39990), created_at:now },
    { name:'Phanteks Eclipse P400A',  category:'case', price:29990, brand:'Phanteks',       socket:null, memory_type:null, tdp:null, wattage:null, specs:'ATX, Mesh front, 3×120mm DRGB fans, TG', description:'Бюджетный корпус с RGB вентиляторами в комплекте.',         image:'https://placehold.co/400x300/111/e040fb?text=P400A',      stock:14, tags:['budget'],  views:0, price_history:ph(29990), created_at:now },
    { name:'Cooler Master HAF 700',   category:'case', price:89990, brand:'Cooler Master',  socket:null, memory_type:null, tdp:null, wattage:null, specs:'E-ATX, Panoramic TG, ARGB, 3×200mm fans', description:'Монструозный корпус с огромными 200мм вентиляторами.',     image:'https://placehold.co/400x300/111/e040fb?text=HAF+700',    stock:3,  tags:['top'],     views:0, price_history:ph(89990), created_at:now },
    // ─── Coolers ─────────────────────────────────────────────────────
    { name:'Noctua NH-D15',           category:'cooler', price:29990, brand:'Noctua',        socket:null, memory_type:null, tdp:null, wattage:null, specs:'Dual Tower, 2×140mm, 250W TDP, AM4/AM5/LGA1700', description:'Лучший воздушный кулер. Тихий и мощный. Культовый продукт.', image:'https://placehold.co/400x300/111/aaaaaa?text=NH-D15',   stock:10, tags:['top','popular'], views:0, price_history:ph(29990), created_at:now },
    { name:'be quiet! Dark Rock Pro 4',category:'cooler', price:24990, brand:'be quiet!',    socket:null, memory_type:null, tdp:null, wattage:null, specs:'Dual Tower, 2×135mm, 250W TDP, AM4/LGA1700',     description:'Тихий и мощный воздушный кулер. Чёрный дизайн.',             image:'https://placehold.co/400x300/111/aaaaaa?text=Dark+Rock',stock:8,  tags:[],                views:0, price_history:ph(24990), created_at:now },
    { name:'Corsair H150i Elite',     category:'cooler', price:39990, brand:'Corsair',       socket:null, memory_type:null, tdp:null, wattage:null, specs:'360mm AIO, 3×120mm RGB, AM4/AM5/LGA1700',         description:'360мм СВО с RGB подсветкой. Для разгона и топовых CPU.',    image:'https://placehold.co/400x300/111/aaaaaa?text=H150i',    stock:7,  tags:['popular'],       views:0, price_history:ph(39990), created_at:now },
    { name:'NZXT Kraken X63',         category:'cooler', price:34990, brand:'NZXT',          socket:null, memory_type:null, tdp:null, wattage:null, specs:'280mm AIO, 2×140mm, Infinity Mirror Pump', description:'Стильная СВО с уникальным дизайном помпы. 280мм радиатор.', image:'https://placehold.co/400x300/111/aaaaaa?text=Kraken+X63', stock:6, tags:['gaming'],         views:0, price_history:ph(34990), created_at:now },
    { name:'Cooler Master Hyper 212', category:'cooler', price:9990,  brand:'Cooler Master', socket:null, memory_type:null, tdp:null, wattage:null, specs:'Single Tower, 120mm, 150W TDP, AM4/LGA1700',       description:'Культовый бюджетный кулер. Лучший за эту цену.',             image:'https://placehold.co/400x300/111/aaaaaa?text=Hyper+212', stock:25, tags:['budget'],        views:0, price_history:ph(9990),  created_at:now },
  ];

  await ins(db.products, products);
  console.log(`✅ Seeded ${products.length} products`);

  // Preset builds
  const all = await q(db.products);
  const byName = {};
  all.forEach(p => byName[p.name] = p._id);

  await ins(db.builds, [
    {
      name:'Игровой Старт', is_preset:true,
      description:'Отличный старт для гейминга в 1080p',
      total: 89990+54990+149990+49990+44990+44990+34990+9990,
      components:{
        cpu:      byName['AMD Ryzen 5 7600X'],
        motherboard:byName['Gigabyte B650M DS3H'],
        gpu:      byName['NVIDIA RTX 4060'],
        ram:      byName['Kingston Fury Beast DDR5 32GB'],
        ssd:      byName['Samsung 970 EVO Plus 1TB'],
        psu:      byName['Seasonic Focus GX-650'],
        case:     byName['NZXT H510 Flow'],
        cooler:   byName['Cooler Master Hyper 212'],
      },
      price_history:[
        { price:469000, date:new Date(Date.now()-60*24*3600*1000) },
        { price:489990, date:new Date(Date.now()-30*24*3600*1000) },
        { price:89990+54990+149990+49990+44990+44990+34990+9990, date:new Date() },
      ],
      created_at:new Date()
    },
    {
      name:'Игровой Pro', is_preset:true,
      description:'Мощная система для 1440p/144fps',
      total: 139990+79990+249990+54990+54990+64990+44990+24990,
      components:{
        cpu:      byName['AMD Ryzen 7 7700X'],
        motherboard:byName['ASUS TUF Gaming B650-Plus'],
        gpu:      byName['NVIDIA RTX 4070'],
        ram:      byName['Corsair Vengeance DDR5 32GB'],
        ssd:      byName['WD Black SN850X 1TB'],
        psu:      byName['Corsair RM850x'],
        case:     byName['Fractal Design Meshify 2'],
        cooler:   byName['NZXT Kraken X63'],
      },
      price_history:[
        { price:720000, date:new Date(Date.now()-60*24*3600*1000) },
        { price:750000, date:new Date(Date.now()-30*24*3600*1000) },
        { price:139990+79990+249990+54990+54990+64990+44990+24990, date:new Date() },
      ],
      created_at:new Date()
    },
    {
      name:'Рабочая Станция', is_preset:true,
      description:'Профессиональная система для 3D, видео, стриминга',
      total: 289990+189990+399990+89990+99990+89990+59990+39990,
      components:{
        cpu:      byName['AMD Ryzen 9 7950X'],
        motherboard:byName['ASUS ROG Strix X670E-E'],
        gpu:      byName['AMD Radeon RX 7900 XTX'],
        ram:      byName['Corsair Vengeance DDR5 64GB'],
        ssd:      byName['Seagate FireCuda 530 2TB'],
        psu:      byName['Corsair HX1000'],
        case:     byName['Lian Li PC-O11 Dynamic'],
        cooler:   byName['Corsair H150i Elite'],
      },
      price_history:[
        { price:1400000, date:new Date(Date.now()-60*24*3600*1000) },
        { price:1500000, date:new Date(Date.now()-30*24*3600*1000) },
        { price:289990+189990+399990+89990+99990+89990+59990+39990, date:new Date() },
      ],
      created_at:new Date()
    },
  ]);
  console.log('✅ Seeded 3 preset builds');
}

/* ─── START ─────────────────────────────────────────────────── */
seed().then(() => {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n🚀 CyberPC запущен:`);
    console.log(`   http://localhost:${PORT}`);
    console.log(`   http://127.0.0.1:${PORT}`);
    console.log(`\n📧 Админ: admin@cyberpc.kz / admin123\n`);
  });
}).catch(e => { console.error('Ошибка запуска:', e); process.exit(1); });
