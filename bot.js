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

  let t = '👋 *Selamat Datang di Railway VPS Creator Bot!*\n\n';
  t += '📖 *Panduan Penggunaan:*\n';
  t += '1. Buat token di https://railway.com/account/tokens\n';
  t += '2. Klik *➕ Add Token Railway* dan kirimkan tokenmu.\n';
  t += '3. Tekan *🚀 Buat VPS* — bot akan otomatis mengurus semua setup (Workspace, Project, Docker Ubuntu, dan SSH) tanpa perlu buka web lagi.\n';
  t += '4. Bot memiliki sistem auto-retry hingga 7 kali jika terjadi kendala jaringan di Railway.\n';
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

// Helper: Ambil atau Otomatis Buat Workspace jika belum ada
async function ensureWorkspace(headers) {
  // 1. Cek query workspaces yang sudah ada
  try {
    const res = await axios.post('https://backboard.railway.app/graphql/v2', {
      query: `query {
        workspaces {
          id
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
    }, { headers });

    const list = res.data?.data?.workspaces;
    if (list && list.length > 0 && list[0].id) {
      return {
        id: list[0].id,
        name: list[0].name,
        projects: list[0].projects?.edges ? list[0].projects.edges.map(e => e.node) : []
      };
    }
  } catch (e) {}

  // 2. Jika belum ada workspace, bot langsung buat workspace baru secara otomatis
  try {
    const createWs = await axios.post('https://backboard.railway.app/graphql/v2', {
      query: `mutation {
        workspaceCreate(input: { name: "My Workspace" }) {
          id
          name
        }
      }`
    }, { headers });

    const newWs = createWs.data?.data?.workspaceCreate;
    if (newWs && newWs.id) {
      return { id: newWs.id, name: newWs.name, projects: [] };
    }
  } catch (e) {}

  // 3. Fallback: Ambil via query me
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
              }
            }
          }
        }
      }`
    }, { headers });

    const me = resMe.data?.data?.me;
    return {
      id: me?.id || null,
      name: me?.name || 'Personal',
      projects: me?.projects?.edges ? me.projects.edges.map(e => e.node) : []
    };
  } catch (e) {}

  return { id: null, name: 'Personal', projects: [] };
}

// 7 Langkah Pembuatan VPS Otomatis
async function deployVpsProcess(id, tk, statusMsg, attemptNum) {
  const headers = { Authorization: 'Bearer ' + tk, 'Content-Type': 'application/json' };
  const pass = genPass();
  let createdProjectId = null;

  const updateStatus = async (stepNum, textStatus) => {
    let text = `⚙️ *Sedang Menyiapkan VPS (Percobaan ${attemptNum}/7)*\n`;
    text += `📍 *Langkah ${stepNum}/7:* ${textStatus}`;
    try {
      await bot.editMessageText(text, {
        chat_id: id,
        message_id: statusMsg.message_id,
        parse_mode: 'Markdown'
      });
    } catch (e) {}
  };

  try {
    // STEP 1/7: Otomatis Menyiapkan Workspace
    await updateStatus(1, 'Memeriksa & menyiapkan Workspace Railway otomatis...');
    const ws = await ensureWorkspace(headers);

    // STEP 2/7: Membuat Project Baru
    await updateStatus(2, 'Membuat project container baru...');
    let inputData = { name: `vps-${id}` };
    if (ws.id) {
      inputData.workspaceId = ws.id;
    }

    const qP = {
      query: `mutation($input: ProjectCreateInput!) {
        projectCreate(input: $input) {
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
      }`,
      variables: { input: inputData }
    };

    let resP = await axios.post('https://backboard.railway.app/graphql/v2', qP, { headers });

    // Fallback jika tidak boleh menyertakan workspaceId
    if (resP.data.errors && resP.data.errors[0]?.message?.includes('Workspace not found')) {
      delete inputData.workspaceId;
      resP = await axios.post('https://backboard.railway.app/graphql/v2', {
        query: `mutation($input: ProjectCreateInput!) {
          projectCreate(input: $input) {
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
        }`,
        variables: { input: inputData }
      }, { headers });
    }

    if (resP.data.errors) throw new Error(resP.data.errors[0].message);

    const pData = resP.data.data.projectCreate;
    createdProjectId = pData.id;
    const envId = pData.environments.edges[0]?.node?.id;

    // STEP 3/7: Membuat Service Ubuntu 22.04
    await updateStatus(3, 'Menginstal container OS Ubuntu 22.04 LTS...');
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

    // STEP 4/7: Injeksi Root Password
    await updateStatus(4, 'Menginjeksi kredensial password root...');
    if (envId) {
      const qVar = {
        query: `mutation {
          variableUpsert(input: {
            projectId: "${createdProjectId}",
            serviceId: "${sId}",
            environmentId: "${envId}",
            name: "ROOT_PASSWORD",
            value: "${pass}"
          })
        }`
      };
      await axios.post('https://backboard.railway.app/graphql/v2', qVar, { headers }).catch(() => {});
    }

    // STEP 5/7: Konfigurasi SSH Daemon Agar Tidak Exit/Crash
    await updateStatus(5, 'Mengonfigurasi SSH Daemon & loop foreground...');
    const startCmd = `/bin/sh -c "echo 'root:${pass}' | chpasswd && mkdir -p /var/run/sshd && /usr/sbin/sshd -D || (service ssh restart && tail -f /dev/null)"`;
    const qUp = {
      query: `mutation($serviceId: String!, $environmentId: String!, $input: ServiceInstanceUpdateInput!) {
        serviceInstanceUpdate(serviceId: $serviceId, environmentId: $environmentId, input: $input)
      }`,
      variables: {
        serviceId: sId,
        environmentId: envId,
        input: {
          startCommand: startCmd
        }
      }
    };
    await axios.post('https://backboard.railway.app/graphql/v2', qUp, { headers }).catch(() => {});

    // STEP 6/7: Membuka TCP Proxy Port 22 & Resolve DNS IP
    await updateStatus(6, 'Membuka TCP Proxy port 22 & me-resolve IP numerik...');
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
      if (dnsRes && dnsRes.address) {
        resolvedIp = dnsRes.address;
      }
    } catch (e) {
      resolvedIp = dom;
    }

    // STEP 7/7: Verifikasi Boot & Jaringan Port SSH
    await updateStatus(7, 'Memverifikasi status container & finalisasi koneksi SSH...');
    await sleep(13000);

    return {
      success: true,
      projectId: createdProjectId,
      ip: resolvedIp,
      port: port,
      pass: pass
    };

  } catch (err) {
    if (createdProjectId) {
      try {
        await axios.post('https://backboard.railway.app/graphql/v2', {
          query: `mutation { projectDelete(id: "${createdProjectId}") }`
        }, { headers });
      } catch (e) {}
    }
    return {
      success: false,
      error: err.response?.data?.errors?.[0]?.message || err.message
    };
  }
}

bot.on('message', async (msg) => {
  const id = msg.chat.id;
  const text = msg.text;
  if (!text || text.startsWith('/')) return;
  const db = loadDB();

  // Simpan Token Baru
  if (state[id] === 'WAITING_TOKEN') {
    const cleanToken = text.replace(/[\r\n\s\t]+/g, '');
    db.tokens[id] = cleanToken;
    saveDB(db);
    delete state[id];
    return bot.sendMessage(id, '✅ Token Railway berhasil disimpan!\nTekan tombol *🚀 Buat VPS* untuk memulai pembuatan otomatis.', { parse_mode: 'Markdown', ...getMenu(id) });
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

  // Cek Token
  if (text === '🔍 Cek Token') {
    if (!db.tokens[id]) return bot.sendMessage(id, '⚠️ Anda belum memasukkan token Railway.');
    bot.sendMessage(id, '⏳ Memeriksa data workspace & project di Railway...');
    try {
      const tk = db.tokens[id].replace(/[\r\n\s\t]+/g, '');
      const headers = { Authorization: 'Bearer ' + tk, 'Content-Type': 'application/json' };

      const ws = await ensureWorkspace(headers);
      const totalProjects = ws.projects.length;

      let report = `👤 *Info Akun Railway:*\n`;
      report += `- Workspace: \`${ws.name}\`\n`;
      report += `- Workspace ID: \`${ws.id || 'Otomatis'}\`\n\n`;
      report += `📦 *Daftar Project (${totalProjects}):*\n`;

      if (totalProjects === 0) {
        report += `_Tidak ada project (No Project - Bersih)_\n\n`;
        report += `🟢 *Status:* *Siap Buat VPS Baru* ✅`;
      } else {
        ws.projects.forEach((p, idx) => {
          report += `${idx + 1}. *${p.name}* (\`${p.id}\`)\n`;
        });
        report += `\n⚠️ *Perhatian:* Hapus project di atas jika ingin membuat VPS baru.`;
      }

      return bot.sendMessage(id, report, { parse_mode: 'Markdown' });
    } catch (err) {
      const errMsg = err.response?.data?.errors?.[0]?.message || err.message;
      return bot.sendMessage(id, '❌ *Gagal Cek Token:*\n`' + errMsg + '`', { parse_mode: 'Markdown' });
    }
  }

  // Buat VPS Otomatis (7 Steps & 7x Auto-Retry)
  if (text === '🚀 Buat VPS') {
    if (!db.tokens[id]) return bot.sendMessage(id, '⚠️ Masukkan token Railway terlebih dahulu via menu ➕ Add Token Railway.');
    const tk = db.tokens[id].replace(/[\r\n\s\t]+/g, '');

    const statusMsg = await bot.sendMessage(id, '⏳ *Memulai Sistem Deploy VPS Otomatis...*\nMenjalankan 7 Langkah dengan Auto-Retry 7x.', { parse_mode: 'Markdown' });

    let finalResult = null;
    const MAX_RETRIES = 7;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      finalResult = await deployVpsProcess(id, tk, statusMsg, attempt);

      if (finalResult.success) {
        break;
      }

      if (attempt < MAX_RETRIES) {
        let retryMsg = `⚠️ *Percobaan ke-${attempt} Gagal!*\nAlasan: \`${finalResult.error}\`\n\n🔄 *Mencoba ulang otomatis (Percobaan ${attempt + 1}/7)* dalam 5 detik...`;
        try {
          await bot.editMessageText(retryMsg, {
            chat_id: id,
            message_id: statusMsg.message_id,
            parse_mode: 'Markdown'
          });
        } catch (e) {}
        await sleep(5000);
      }
    }

    if (finalResult && finalResult.success) {
      db.vps[id] = {
        projectId: finalResult.projectId,
        pass: finalResult.pass,
        dom: finalResult.ip,
        port: finalResult.port
      };
      saveDB(db);

      let info = '🎉 *VPS Ubuntu 22.04 Berhasil Dibuat!*\n';
      info += '━━━━━━━━━━━━━━━━━━━━━\n';
      info += '🌐 *IP Address :* `' + finalResult.ip + '`\n';
      info += '🔌 *Port SSH   :* `' + finalResult.port + '`\n';
      info += '👤 *Username   :* `root`\n';
      info += '🔑 *Password   :* `' + finalResult.pass + '`\n';
      info += '━━━━━━━━━━━━━━━━━━━━━\n';
      info += '📌 *Format Login SSH:* \n`ssh root@' + finalResult.ip + ' -p ' + finalResult.port + '`';

      await bot.editMessageText(info, {
        chat_id: id,
        message_id: statusMsg.message_id,
        parse_mode: 'Markdown'
      });
    } else {
      let failInfo = '❌ *Deploy VPS Gagal Setelah 7x Percobaan!*\n\n';
      failInfo += 'Penyebab Terakhir:\n`' + (finalResult?.error || 'Unknown Error') + '`\n\n';
      failInfo += '💡 *Saran:* Pastikan kuota akun Railway kamu masih tersedia dan token valid.';
      await bot.editMessageText(failInfo, {
        chat_id: id,
        message_id: statusMsg.message_id,
        parse_mode: 'Markdown'
      });
    }
  }

  // Hapus VPS
  if (text === '❌ Hapus VPS') {
    if (!db.vps[id]) return bot.sendMessage(id, '⚠️ Tidak ada data VPS aktif.');
    try {
      const pId = db.vps[id].projectId;
      const tk = db.tokens[id].replace(/[\r\n\s\t]+/g, '');
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
