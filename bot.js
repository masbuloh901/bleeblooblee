const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const fs = require('fs');

// Konfigurasi Utama
const BOT_TOKEN = '8571356168:AAE5Au3Ekp9u-HAXJ0OM5CXBGK16faLP9nk';
const ADMIN_ID = 7192974216;
const DB_FILE = '/root/database.json';

const bot = new TelegramBot(BOT_TOKEN, { polling: true });

// Helper Database JSON
function loadDB() {
  if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify({ users: {}, tokens: {}, vps: {} }, null, 2));
  }
  return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
}

function saveDB(d) {
  fs.writeFileSync(DB_FILE, JSON.stringify(d, null, 2));
}

// Generate Password Acak: Rabitszz + 5 Angka
function genPass() {
  return 'Rabitszz' + Math.floor(10000 + Math.random() * 90000);
}

const state = {};

// Keyboard Menu
function getMenu(id) {
  const k = [
    [{ text: '➕ Add Token Railway' }, { text: '🗑️ Hapus Token' }],
    [{ text: '🚀 Buat VPS' }, { text: '❌ Hapus VPS' }],
    [{ text: 'ℹ️ Cek Status Akun' }]
  ];
  if (Number(id) === ADMIN_ID) {
    k.push([{ text: '👑 Admin: List User' }, { text: '📢 Admin: Broadcast' }]);
  }
  return { reply_markup: { keyboard: k, resize_keyboard: true } };
}

// Command: /start
bot.onText(/\/start/, async (msg) => {
  const id = msg.chat.id;
  const db = loadDB();
  if (!db.users[id]) {
    db.users[id] = {
      id: id,
      username: msg.from.username || 'Tanpa Username',
      name: msg.from.first_name || 'User'
    };
    saveDB(db);
  }
  try {
    await bot.sendSticker(id, 'CAACAgIAAxkBAAEK1eJl3X6-jG9N_z-1v4u8cZqNqQABWgACDAEAAlA-TQtgG9JgR-L2XDAE');
  } catch (e) {}

  let t = '👋 *Selamat Datang di Railway VPS Creator Bot!*\n\n';
  t += '📖 *Panduan Penggunaan:*\n';
  t += '1. Masuk ke: https://railway.com/account/tokens\n';
  t += '2. Pastikan akun / workspace kamu *masih kosong (No Project)* agar kuota mencukupi.\n';
  t += '3. Buat token baru lalu salin tokennya.\n';
  t += '4. Klik tombol *➕ Add Token Railway* dan tempel tokenmu di bot ini.\n';
  t += '5. Tekan tombol *🚀 Buat VPS* untuk proses instalasi Ubuntu 22.04 otomatis.\n';
  t += '6. Kamu akan mendapatkan Host/IP Proxy, Port, User root, dan Password.\n';
  t += '7. Gunakan *❌ Hapus VPS* jika ingin menghapus project dari akun.\n';
  bot.sendMessage(id, t, { parse_mode: 'Markdown', ...getMenu(id) });
});

// Admin Command: /user
bot.onText(/\/user/, (msg) => {
  const id = msg.chat.id;
  if (Number(id) !== ADMIN_ID) return bot.sendMessage(id, '⛔ Khusus Admin.');
  const db = loadDB();
  const u = Object.values(db.users);
  if (!u.length) return bot.sendMessage(id, 'Belum ada pengguna terdaftar.');
  let r = '📋 *Daftar Pengguna:*\n\n';
  u.forEach((x, i) => {
    r += (i + 1) + '. @' + x.username + ' (`' + x.id + '`)\n';
  });
  bot.sendMessage(id, r, { parse_mode: 'Markdown' });
});

// Message & Menu Handler
bot.on('message', async (msg) => {
  const id = msg.chat.id;
  const text = msg.text;
  if (!text || text.startsWith('/')) return;
  const db = loadDB();

  // State: Add Token
  if (state[id] === 'WAITING_TOKEN') {
    db.tokens[id] = text.trim();
    saveDB(db);
    delete state[id];
    return bot.sendMessage(id, '✅ Token Railway berhasil disimpan!', getMenu(id));
  }

  // State: Broadcast Admin
  if (state[id] === 'WAITING_BC' && Number(id) === ADMIN_ID) {
    delete state[id];
    let s = 0;
    for (const uid of Object.keys(db.users)) {
      try {
        await bot.sendMessage(uid, '📢 *BROADCAST:*\n\n' + text, { parse_mode: 'Markdown' });
        s++;
      } catch (e) {}
    }
    return bot.sendMessage(id, '✅ Broadcast selesai dikirim ke ' + s + ' user.');
  }

  // Menu Options
  if (text === '➕ Add Token Railway') {
    state[id] = 'WAITING_TOKEN';
    return bot.sendMessage(id, 'Silakan kirim token Railway Account Anda:\nContoh: `93312467-7498-4cf6-adfe-xxxx`');
  }

  if (text === '🗑️ Hapus Token') {
    delete db.tokens[id];
    saveDB(db);
    return bot.sendMessage(id, '🗑️ Token Railway telah dihapus.');
  }

  if (text === 'ℹ️ Cek Status Akun') {
    const tk = db.tokens[id] ? '✅ Terpasang' : '❌ Belum Ada';
    const vp = db.vps[id] ? '✅ Aktif' : '❌ Tidak Ada';
    return bot.sendMessage(id, '*Status Profil:*\n- Token: ' + tk + '\n- VPS: ' + vp, { parse_mode: 'Markdown' });
  }

  if (text === '🚀 Buat VPS') {
    if (!db.tokens[id]) return bot.sendMessage(id, '⚠️ Masukkan token Railway terlebih dahulu via menu ➕ Add Token Railway.');
    const pass = genPass();
    bot.sendMessage(id, '⏳ Sedang mendeploy VPS Ubuntu 22.04 ke Railway...\nMohon tunggu sekitar 15-30 detik.');

    try {
      const tk = db.tokens[id];
      const headers = {
        Authorization: 'Bearer ' + tk,
        'Content-Type': 'application/json'
      };

      // 1. Buat Project Baru
      const qP = { query: 'mutation { projectCreate(input: { name: "vps-' + id + '" }) { id } }' };
      const resP = await axios.post('https://backboard.railway.app/graphql/v2', qP, { headers });
      
      if (resP.data.errors) {
        throw new Error(resP.data.errors[0].message);
      }
      const pId = resP.data.data.projectCreate.id;

      // 2. Buat Service Ubuntu 22.04 dengan Docker Image SSH
      const qS = {
        query: 'mutation { serviceCreate(input: { projectId: "' + pId + '", name: "ubuntu-ssh", source: { image: "rastoregm/ubuntu-22" } }) { id } }'
      };
      const resS = await axios.post('https://backboard.railway.app/graphql/v2', qS, { headers });
      
      if (resS.data.errors) {
        throw new Error(resS.data.errors[0].message);
      }
      const sId = resS.data.data.serviceCreate.id;

      // 3. Pasang Variabel Root Password di Service
      const qVar = {
        query: 'mutation { variableUpsert(input: { projectId: "' + pId + '", serviceId: "' + sId + '", environmentId: "production", name: "ROOT_PASSWORD", value: "' + pass + '" }) }'
      };
      await axios.post('https://backboard.railway.app/graphql/v2', qVar, { headers }).catch(() => {});

      // 4. Buka TCP Proxy Port 22
      const qX = {
        query: 'mutation { tcpProxyCreate(input: { serviceId: "' + sId + '", applicationPort: 22 }) { domain proxyPort } }'
      };
      const resX = await axios.post('https://backboard.railway.app/graphql/v2', qX, { headers });
      
      const p = resX.data.data && resX.data.data.tcpProxyCreate;
      const dom = (p && p.domain) ? p.domain : 'roundhouse.proxy.rlwy.net';
      const port = (p && p.proxyPort) ? p.proxyPort : 2222;

      db.vps[id] = { projectId: pId, pass: pass, dom: dom, port: port };
      saveDB(db);

      let info = '🎉 *VPS Ubuntu 22.04 Berhasil Dibuat!*\n\n';
      info += '🌐 *Host / IP Proxy :* `' + dom + '`\n';
      info += '🔌 *Port :* `' + port + '`\n';
      info += '👤 *User :* `root`\n';
      info += '🔑 *Password :* `' + pass + '`\n\n';
      info += '📌 *Koneksi SSH Terminal:* \n`ssh root@' + dom + ' -p ' + port + '`';
      return bot.sendMessage(id, info, { parse_mode: 'Markdown' });

    } catch (err) {
      console.error(err.response?.data || err.message);
      const errMsg = err.response?.data?.errors?.[0]?.message || err.message || 'Token atau kuota Railway tidak valid.';
      return bot.sendMessage(id, '❌ *Gagal membuat VPS:*\n`' + errMsg + '`\n\nPastikan workspace di Railway tidak memiliki project lain dan kuota akun aktif.', { parse_mode: 'Markdown' });
    }
  }

  if (text === '❌ Hapus VPS') {
    if (!db.vps[id]) return bot.sendMessage(id, '⚠️ Tidak ada data VPS aktif.');
    try {
      const pId = db.vps[id].projectId;
      const tk = db.tokens[id];
      const qD = { query: 'mutation { projectDelete(id: "' + pId + '") }' };
      await axios.post('https://backboard.railway.app/graphql/v2', qD, {
        headers: { Authorization: 'Bearer ' + tk, 'Content-Type': 'application/json' }
      });
      delete db.vps[id];
      saveDB(db);
      return bot.sendMessage(id, '✅ Layanan VPS berhasil dihapus dari akun Railway.');
    } catch (e) {
      return bot.sendMessage(id, '❌ Gagal menghapus VPS di Railway.');
    }
  }

  if (text === '👑 Admin: List User' && Number(id) === ADMIN_ID) {
    const u = Object.values(db.users);
    let r = '📋 Total: ' + u.length + ' user\n\n';
    u.forEach((x, i) => {
      r += (i + 1) + '. @' + x.username + ' (' + x.id + ')\n';
    });
    return bot.sendMessage(id, r);
  }

  if (text === '📢 Admin: Broadcast' && Number(id) === ADMIN_ID) {
    state[id] = 'WAITING_BC';
    return bot.sendMessage(id, 'Silakan ketik isi pesan broadcast yang ingin disebarkan:');
  }
});
