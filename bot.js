const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const fs = require('fs');

// Konfigurasi Utama
const BOT_TOKEN = '8571356168:AAE5Au3Ekp9u-HAXJ0OM5CXBGK16faLP9nk';
const ADMIN_ID = 7192974216;
const DB_FILE = '/root/database.json';

const bot = new TelegramBot(BOT_TOKEN, { polling: true });

function loadDB() {
  if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify({ users: {}, tokens: {}, vps: {} }, null, 2));
  }
  return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
}

function saveDB(d) {
  fs.writeFileSync(DB_FILE, JSON.stringify(d, null, 2));
}

function genPass() {
  return 'Rabitszz' + Math.floor(10000 + Math.random() * 90000);
}

const state = {};

function getMenu(id) {
  const k = [
    [{ text: '➕ Add Token Railway' }, { text: '🗑️ Hapus Token' }],
    [{ text: '🔍 Cek Token' }, { text: 'ℹ️ Cek Status Akun' }],
    [{ text: '🚀 Buat VPS' }, { text: '❌ Hapus VPS' }]
  ];
  if (Number(id) === ADMIN_ID) {
    k.push([{ text: '👑 Admin: List User' }, { text: '📢 Admin: Broadcast' }]);
  }
  return { reply_markup: { keyboard: k, resize_keyboard: true } };
}

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
  t += '2. Pastikan akun / workspace kamu *No Project (Kosong)* agar kuota mencukupi.\n';
  t += '3. Buat token baru lalu salin tokennya.\n';
  t += '4. Klik *➕ Add Token Railway* dan kirimkan tokenmu.\n';
  t += '5. Gunakan tombol *🔍 Cek Token* untuk memastikan slot project masih tersedia.\n';
  t += '6. Tekan *🚀 Buat VPS* untuk auto deploy container Ubuntu 22.04.\n';
  t += '7. Klik *❌ Hapus VPS* jika ingin membersihkan project.\n';
  bot.sendMessage(id, t, { parse_mode: 'Markdown', ...getMenu(id) });
});

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

bot.on('message', async (msg) => {
  const id = msg.chat.id;
  const text = msg.text;
  if (!text || text.startsWith('/')) return;
  const db = loadDB();

  if (state[id] === 'WAITING_TOKEN') {
    db.tokens[id] = text.trim();
    saveDB(db);
    delete state[id];
    return bot.sendMessage(id, '✅ Token Railway berhasil disimpan!', getMenu(id));
  }

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

  if (text === '➕ Add Token Railway') {
    state[id] = 'WAITING_TOKEN';
    return bot.sendMessage(id, 'Silakan kirim token Railway API Anda:\nContoh: `93312467-7498-4cf6-adfe-xxxx`');
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

  // Tombol Baru: Cek Detail Token, Project, & Kuota
  if (text === '🔍 Cek Token') {
    if (!db.tokens[id]) return bot.sendMessage(id, '⚠️ Anda belum memasukkan token Railway.');
    bot.sendMessage(id, '⏳ Memeriksa data akun dan project Railway...');
    try {
      const tk = db.tokens[id];
      const headers = { Authorization: 'Bearer ' + tk, 'Content-Type': 'application/json' };
      const qMe = {
        query: `query {
          me {
            id
            email
            name
            projects {
              edges {
                node {
                  id
                  name
                  createdAt
                }
              }
            }
          }
        }`
      };
      const resMe = await axios.post('https://backboard.railway.app/graphql/v2', qMe, { headers });
      if (resMe.data.errors) throw new Error(resMe.data.errors[0].message);

      const me = resMe.data.data.me;
      const projects = me.projects?.edges || [];
      const totalProjects = projects.length;

      let report = `👤 *Info Akun Railway:*\n`;
      report += `- Nama: \`${me.name || 'User'}\`\n`;
      report += `- Email: \`${me.email || '-'}\`\n\n`;
      report += `📦 *Daftar Project (${totalProjects}):*\n`;

      if (totalProjects === 0) {
        report += `_Tidak ada project (No Project - Bersih)_\n\n`;
        report += `🟢 *Status:* *Bisa Buat VPS Baru* ✅`;
      } else {
        projects.forEach((p, idx) => {
          report += `${idx + 1}. *${p.node.name}* (\`${p.node.id}\`)\n`;
        });
        report += `\n⚠️ *Catatan:* Railway akun gratis membatasi jumlah resource bersamaan. Jika deploy gagal, pastikan hapus project lama terlebih dahulu.`;
      }

      return bot.sendMessage(id, report, { parse_mode: 'Markdown' });
    } catch (err) {
      const errMsg = err.response?.data?.errors?.[0]?.message || err.message;
      return bot.sendMessage(id, '❌ *Token Tidak Valid / Error:*\n`' + errMsg + '`', { parse_mode: 'Markdown' });
    }
  }

  // Deploy VPS
  if (text === '🚀 Buat VPS') {
    if (!db.tokens[id]) return bot.sendMessage(id, '⚠️ Masukkan token Railway terlebih dahulu via menu ➕ Add Token Railway.');
    const pass = genPass();
    bot.sendMessage(id, '⏳ Memulai deploy container Ubuntu 22.04 ke Railway...');

    try {
      const tk = db.tokens[id];
      const headers = { Authorization: 'Bearer ' + tk, 'Content-Type': 'application/json' };

      // 1. Buat Project Baru & Ambil Environment ID Default
      const qP = {
        query: `mutation {
          projectCreate(input: { name: "vps-${id}" }) {
            id
            environments {
              edges {
                node {
                  id
                  name
                }
              }
            }
          }
        }`
      };
      const resP = await axios.post('https://backboard.railway.app/graphql/v2', qP, { headers });
      if (resP.data.errors) throw new Error(resP.data.errors[0].message);

      const pData = resP.data.data.projectCreate;
      const pId = pData.id;
      const envId = pData.environments.edges[0]?.node?.id;

      // 2. Buat Service dengan Docker Image Ubuntu SSH
      const qS = {
        query: `mutation {
          serviceCreate(input: {
            projectId: "${pId}",
            name: "ubuntu-ssh",
            source: { image: "rastoregm/ubuntu-22" }
          }) {
            id
          }
        }`
      };
      const resS = await axios.post('https://backboard.railway.app/graphql/v2', qS, { headers });
      if (resS.data.errors) throw new Error(resS.data.errors[0].message);
      const sId = resS.data.data.serviceCreate.id;

      // 3. Pasang Variabel Root Password di Environment
      if (envId) {
        const qVar = {
          query: `mutation {
            variableUpsert(input: {
              projectId: "${pId}",
              serviceId: "${sId}",
              environmentId: "${envId}",
              name: "ROOT_PASSWORD",
              value: "${pass}"
            })
          }`
        };
        await axios.post('https://backboard.railway.app/graphql/v2', qVar, { headers }).catch(() => {});
      }

      // 4. Buat TCP Proxy ke Port 22 dengan environmentId
      const qX = {
        query: `mutation {
          tcpProxyCreate(input: {
            serviceId: "${sId}",
            environmentId: "${envId}",
            applicationPort: 22
          }) {
            domain
            proxyPort
          }
        }`
      };
      const resX = await axios.post('https://backboard.railway.app/graphql/v2', qX, { headers });
      if (resX.data.errors) throw new Error(resX.data.errors[0].message);

      const p = resX.data.data.tcpProxyCreate;
      const dom = p.domain || 'roundhouse.proxy.rlwy.net';
      const port = p.proxyPort;

      db.vps[id] = { projectId: pId, pass: pass, dom: dom, port: port };
      saveDB(db);

      let info = '🎉 *VPS Ubuntu 22.04 Berhasil Dibuat!*\n\n';
      info += '🌐 *Host / IP Proxy :* `' + dom + '`\n';
      info += '🔌 *Port :* `' + port + '`\n';
      info += '👤 *User :* `root`\n';
      info += '🔑 *Password :* `' + pass + '`\n\n';
      info += '📌 *Koneksi SSH:* \n`ssh root@' + dom + ' -p ' + port + '`';
      return bot.sendMessage(id, info, { parse_mode: 'Markdown' });

    } catch (err) {
      console.error(err.response?.data || err.message);
      const errMsg = err.response?.data?.errors?.[0]?.message || err.message || 'Gagal deploy ke Railway.';
      return bot.sendMessage(id, '❌ *Deploy Gagal:*\n`' + errMsg + '`\n\nCek tombol *🔍 Cek Token* untuk memastikan status akun atau hapus project yang menumpuk.', { parse_mode: 'Markdown' });
    }
  }

  // Hapus VPS
  if (text === '❌ Hapus VPS') {
    if (!db.vps[id]) return bot.sendMessage(id, '⚠️ Tidak ada data VPS aktif.');
    try {
      const pId = db.vps[id].projectId;
      const tk = db.tokens[id];
      const qD = { query: `mutation { projectDelete(id: "${pId}") }` };
      await axios.post('https://backboard.railway.app/graphql/v2', qD, {
        headers: { Authorization: 'Bearer ' + tk, 'Content-Type': 'application/json' }
      });
      delete db.vps[id];
      saveDB(db);
      return bot.sendMessage(id, '✅ Layanan VPS berhasil dihapus dari Railway.');
    } catch (e) {
      return bot.sendMessage(id, '❌ Gagal menghapus VPS di Railway.');
    }
  }

  // Admin Features
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
    return bot.sendMessage(id, 'Silakan ketik isi pesan broadcast:');
  }
});
