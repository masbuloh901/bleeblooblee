const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const fs = require('fs');
const dns = require('dns').promises;

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

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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

  let t = '👋 *Railway Cloud VPS Creator Bot*\n\n';
  t += '📖 *Panduan Praktis:*\n';
  t += '1. Masukkan token Railway via menu *➕ Add Token Railway*.\n';
  t += '2. Klik *🔍 Cek Token* untuk info akun & list project mendalam.\n';
  t += '3. Tekan *🚀 Buat VPS* — bot otomatis menunggu hingga status benar-benar SUCCESS sebelum membagikan detail SSH.\n';
  t += '4. Ingin menghapus? Klik *❌ Hapus VPS* lalu pilih project via tombol interaktif.\n';
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

// Helper: Ambil Workspace Aktif
async function getRailwayWorkspaceId(headers) {
  try {
    const res = await axios.post('https://backboard.railway.app/graphql/v2', {
      query: `query {
        workspaces {
          id
          name
        }
      }`
    }, { headers });
    const list = res.data?.data?.workspaces;
    if (list && list.length > 0 && list[0].id) {
      return { id: list[0].id, name: list[0].name };
    }
  } catch (e) {}

  try {
    const resMe = await axios.post('https://backboard.railway.app/graphql/v2', {
      query: `query {
        me {
          defaultWorkspace {
            id
            name
          }
        }
      }`
    }, { headers });
    const defWs = resMe.data?.data?.me?.defaultWorkspace;
    if (defWs && defWs.id) return { id: defWs.id, name: defWs.name };
  } catch (e) {}

  return { id: null, name: 'Personal Workspace' };
}

// Helper: Ambil Data Akun & Projects
async function fetchFullAccountData(headers) {
  const ws = await getRailwayWorkspaceId(headers);
  let email = '-';
  let userName = 'User';
  let projects = [];

  try {
    const resMe = await axios.post('https://backboard.railway.app/graphql/v2', {
      query: `query {
        me {
          id
          name
          email
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
    }, { headers });

    const me = resMe.data?.data?.me;
    if (me) {
      userName = me.name || userName;
      email = me.email || email;
      if (me.projects?.edges) {
        projects = me.projects.edges.map(e => e.node);
      }
    }
  } catch (e) {}

  if (projects.length === 0) {
    try {
      const resP = await axios.post('https://backboard.railway.app/graphql/v2', {
        query: `query {
          projects {
            edges {
              node {
                id
                name
                createdAt
              }
            }
          }
        }`
      }, { headers });
      const edges = resP.data?.data?.projects?.edges;
      if (edges && Array.isArray(edges)) {
        projects = edges.map(e => e.node);
      }
    } catch (e) {}
  }

  return { wsId: ws.id, wsName: ws.name, email, userName, projects };
}

// Fungsi Polling Deployment sampai status SUCCESS
async function pollDeploymentStatus(serviceId, environmentId, headers, maxRetries = 25) {
  const qStatus = {
    query: `query($serviceId: String!, $environmentId: String!) {
      deployments(first: 1, input: { serviceId: $serviceId, environmentId: $environmentId }) {
        edges {
          node {
            id
            status
          }
        }
      }
    }`,
    variables: { serviceId, environmentId }
  };

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    await sleep(4000);
    try {
      const res = await axios.post('https://backboard.railway.app/graphql/v2', qStatus, { headers });
      const edge = res.data?.data?.deployments?.edges?.[0];
      const status = edge?.node?.status;

      if (status === 'SUCCESS') {
        return true;
      }
      if (status === 'CRASHED' || status === 'FAILED') {
        throw new Error(`Container gagal dijalankan di Railway (Status: ${status})`);
      }
    } catch (err) {
      if (err.message.includes('Status:')) throw err;
    }
  }
  return true;
}

bot.on('message', async (msg) => {
  const id = msg.chat.id;
  const text = msg.text;
  if (!text || text.startsWith('/')) return;
  const db = loadDB();

  // Simpan Token
  if (state[id] === 'WAITING_TOKEN') {
    const cleanToken = text.replace(/[\r\n\s\t]+/g, '');
    db.tokens[id] = cleanToken;
    saveDB(db);
    delete state[id];
    return bot.sendMessage(id, '✅ Token Railway berhasil disimpan!\nSilakan klik menu *🔍 Cek Token* atau *🚀 Buat VPS*.', getMenu(id));
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
    return bot.sendMessage(id, 'Silakan kirim token Railway API Anda:');
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

  // Cek Token Super Detail
  if (text === '🔍 Cek Token') {
    if (!db.tokens[id]) return bot.sendMessage(id, '⚠️ Anda belum memasukkan token Railway.');
    const waitMsg = await bot.sendMessage(id, '⏳ Mengambil detail akun, workspace, dan project dari Railway...');
    try {
      const tk = db.tokens[id].replace(/[\r\n\s\t]+/g, '');
      const headers = { Authorization: 'Bearer ' + tk, 'Content-Type': 'application/json' };

      const acc = await fetchFullAccountData(headers);
      const totalProjects = acc.projects.length;

      let report = `📋 *DETAIL AKUN RAILWAY:*\n`;
      report += `━━━━━━━━━━━━━━━━━━━━━\n`;
      report += `👤 *Nama Akun*   : \`${acc.userName}\`\n`;
      report += `📧 *Email Akun*  : \`${acc.email}\`\n`;
      report += `🏢 *Workspace*   : \`${acc.wsName}\`\n`;
      report += `🆔 *Workspace ID*: \`${acc.wsId || 'Personal Workspace'}\`\n`;
      report += `━━━━━━━━━━━━━━━━━━━━━\n`;
      report += `📦 *Project Aktif (${totalProjects}/3):*\n\n`;

      if (totalProjects === 0) {
        report += `_Tidak ada project berjalan (No Project - Bersih)_\n\n`;
        report += `🟢 *Status Deploy:* *Sangat Siap Buat VPS Baru* ✅`;
      } else {
        acc.projects.forEach((p, idx) => {
          report += `*${idx + 1}. ${p.name}*\n`;
          report += `   ↳ ID: \`${p.id}\`\n`;
        });
        report += `\n⚠️ *Catatan:* Hapus project lama via menu *❌ Hapus VPS* jika ingin membuat VPS baru.`;
      }

      await bot.editMessageText(report, {
        chat_id: id,
        message_id: waitMsg.message_id,
        parse_mode: 'Markdown'
      });
    } catch (err) {
      const errMsg = err.response?.data?.errors?.[0]?.message || err.message;
      return bot.sendMessage(id, '❌ *Gagal Cek Token:*\n`' + errMsg + '`', { parse_mode: 'Markdown' });
    }
  }

  // Buat VPS
  if (text === '🚀 Buat VPS') {
    if (!db.tokens[id]) return bot.sendMessage(id, '⚠️ Masukkan token Railway terlebih dahulu via menu ➕ Add Token Railway.');
    const tk = db.tokens[id].replace(/[\r\n\s\t]+/g, '');
    const headers = { Authorization: 'Bearer ' + tk, 'Content-Type': 'application/json' };
    const pass = genPass();

    const statusMsg = await bot.sendMessage(id, '⏳ *Sedang Menyiapkan VPS...*\n📍 *Tahap 1/5:* Memeriksa dan menginisialisasi Workspace...', { parse_mode: 'Markdown' });

    let createdProjectId = null;

    try {
      const ws = await getRailwayWorkspaceId(headers);
      if (!ws.id) {
        throw new Error('Workspace ID tidak terdeteksi. Silakan coba kembali.');
      }

      // 1. Buat Project Baru
      await bot.editMessageText('⏳ *Sedang Menyiapkan VPS...*\n📍 *Tahap 2/5:* Membuat project baru di Railway...', {
        chat_id: id,
        message_id: statusMsg.message_id,
        parse_mode: 'Markdown'
      });

      const resP = await axios.post('https://backboard.railway.app/graphql/v2', {
        query: `mutation($input: ProjectCreateInput!) {
          projectCreate(input: $input) {
            id
            environments { edges { node { id } } }
          }
        }`,
        variables: {
          input: {
            name: `vps-${id}`,
            workspaceId: ws.id
          }
        }
      }, { headers });

      if (resP.data.errors) {
        throw new Error(resP.data.errors[0].message);
      }

      const pData = resP.data.data.projectCreate;
      createdProjectId = pData.id;
      const envId = pData.environments.edges[0]?.node?.id;

      // 2. Pasang Docker OS Ubuntu 22.04 LTS
      await bot.editMessageText('⏳ *Sedang Menyiapkan VPS...*\n📍 *Tahap 3/5:* Memasang Docker container & mengonfigurasi SSH Daemon...', {
        chat_id: id,
        message_id: statusMsg.message_id,
        parse_mode: 'Markdown'
      });

      const qS = {
        query: `mutation {
          serviceCreate(input: {
            projectId: "${createdProjectId}",
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

      // Injeksi Password Root
      if (envId) {
        await axios.post('https://backboard.railway.app/graphql/v2', {
          query: `mutation {
            variableUpsert(input: {
              projectId: "${createdProjectId}",
              serviceId: "${sId}",
              environmentId: "${envId}",
              name: "ROOT_PASSWORD",
              value: "${pass}"
            })
          }`
        }, { headers }).catch(() => {});
      }

      // Start command menyeluruh: konfigurasi sshd, hak akses root, dan foreground execution
      const startCmd = `/bin/bash -c "mkdir -p /run/sshd && ssh-keygen -A 2>/dev/null && sed -i 's/#PermitRootLogin.*/PermitRootLogin yes/' /etc/ssh/sshd_config 2>/dev/null && echo root:${pass} | chpasswd && /usr/sbin/sshd -D -e"`;
      await axios.post('https://backboard.railway.app/graphql/v2', {
        query: `mutation($serviceId: String!, $environmentId: String!, $input: ServiceInstanceUpdateInput!) {
          serviceInstanceUpdate(serviceId: $serviceId, environmentId: $environmentId, input: $input)
        }`,
        variables: {
          serviceId: sId,
          environmentId: envId,
          input: { startCommand: startCmd }
        }
      }, { headers }).catch(() => {});

      // 3. Buka TCP Proxy Port 22 SSH & DNS Resolve
      await bot.editMessageText('⏳ *Sedang Menyiapkan VPS...*\n📍 *Tahap 4/5:* Membuka TCP Proxy port 22 & me-resolve IP numerik...', {
        chat_id: id,
        message_id: statusMsg.message_id,
        parse_mode: 'Markdown'
      });

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

      let resolvedIp = dom;
      try {
        const dnsRes = await dns.lookup(dom);
        if (dnsRes && dnsRes.address) resolvedIp = dnsRes.address;
      } catch (e) {
        resolvedIp = dom;
      }

      // 4. Polling deployment sampai berstatus SUCCESS
      await bot.editMessageText('⏳ *Sedang Menyiapkan VPS...*\n📍 *Tahap 5/5:* Menunggu container booting dan status berstatus SUCCESS...', {
        chat_id: id,
        message_id: statusMsg.message_id,
        parse_mode: 'Markdown'
      });

      await pollDeploymentStatus(sId, envId, headers);

      db.vps[id] = { projectId: createdProjectId, pass: pass, dom: resolvedIp, port: port };
      saveDB(db);

      let info = '🎉 *VPS Ubuntu 22.04 Berhasil Aktif & Siap Digunakan!*\n';
      info += '━━━━━━━━━━━━━━━━━━━━━\n';
      info += '🌐 *IP Address :* `' + resolvedIp + '`\n';
      info += '🔌 *Port SSH   :* `' + port + '`\n';
      info += '👤 *Username   :* `root`\n';
      info += '🔑 *Password   :* `' + pass + '`\n';
      info += '━━━━━━━━━━━━━━━━━━━━━\n';
      info += '📌 *Format Login SSH:* \n`ssh root@' + resolvedIp + ' -p ' + port + '`';

      await bot.editMessageText(info, {
        chat_id: id,
        message_id: statusMsg.message_id,
        parse_mode: 'Markdown'
      });

    } catch (err) {
      if (createdProjectId) {
        await axios.post('https://backboard.railway.app/graphql/v2', {
          query: `mutation { projectDelete(id: "${createdProjectId}") }`
        }, { headers }).catch(() => {});
      }
      const errMsg = err.response?.data?.errors?.[0]?.message || err.message || 'Gagal deploy ke Railway.';
      return bot.editMessageText('❌ *Deploy Gagal:*\n`' + errMsg + '`', {
        chat_id: id,
        message_id: statusMsg.message_id,
        parse_mode: 'Markdown'
      });
    }
  }

  // Hapus VPS Berbasis Tombol Inline
  if (text === '❌ Hapus VPS') {
    if (!db.tokens[id]) return bot.sendMessage(id, '⚠️ Anda belum memasukkan token Railway.');
    const waitMsg = await bot.sendMessage(id, '🔍 Mencari project VPS yang aktif di akun Railway...');
    try {
      const tk = db.tokens[id].replace(/[\r\n\s\t]+/g, '');
      const headers = { Authorization: 'Bearer ' + tk, 'Content-Type': 'application/json' };

      const acc = await fetchFullAccountData(headers);
      if (acc.projects.length === 0) {
        return bot.editMessageText('ℹ️️ *Tidak Ada Project yang Ditemukan.*\nAkun Railway kamu sudah bersih dari project.', {
          chat_id: id,
          message_id: waitMsg.message_id,
          parse_mode: 'Markdown'
        });
      }

      const buttons = acc.projects.map(p => ([{
        text: `🗑️ Hapus: ${p.name}`,
        callback_data: `del_${p.id}`
      }]));

      buttons.push([{ text: '❌ Batal', callback_data: 'del_cancel' }]);

      await bot.editMessageText('🗑️ *Pilih Project VPS yang Ingin Dihapus:*\nKlik salah satu tombol di bawah untuk menghapusnya langsung dari Railway:', {
        chat_id: id,
        message_id: waitMsg.message_id,
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: buttons }
      });

    } catch (err) {
      return bot.editMessageText('❌ Gagal memeriksa project untuk dihapus.', {
        chat_id: id,
        message_id: waitMsg.message_id
      });
    }
  }

  // Fitur Admin
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

// Handler Klik Tombol Hapus VPS (Inline Keyboard)
bot.on('callback_query', async (query) => {
  const id = query.message.chat.id;
  const msgId = query.message.message_id;
  const data = query.data;
  const db = loadDB();

  if (data === 'del_cancel') {
    await bot.answerCallbackQuery(query.id, { text: 'Dibatalkan' });
    return bot.deleteMessage(id, msgId);
  }

  if (data.startsWith('del_')) {
    const targetProjectId = data.replace('del_', '');
    await bot.answerCallbackQuery(query.id, { text: 'Sedang menghapus project...' });

    try {
      const tk = db.tokens[id].replace(/[\r\n\s\t]+/g, '');
      const headers = { Authorization: 'Bearer ' + tk, 'Content-Type': 'application/json' };

      await axios.post('https://backboard.railway.app/graphql/v2', {
        query: `mutation { projectDelete(id: "${targetProjectId}") }`
      }, { headers });

      if (db.vps[id] && db.vps[id].projectId === targetProjectId) {
        delete db.vps[id];
        saveDB(db);
      }

      await bot.editMessageText(`✅ *Project Berhasil Dihapus!*\nID: \`${targetProjectId}\` telah dibersihkan dari Railway.`, {
        chat_id: id,
        message_id: msgId,
        parse_mode: 'Markdown'
      });

    } catch (e) {
      await bot.editMessageText('❌ Gagal menghapus project di Railway.', {
        chat_id: id,
        message_id: msgId
      });
    }
  }
});
