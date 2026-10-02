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
  t += '1. Masuk ke Railway: https://railway.com\n';
  t += '2. Pastikan akun memiliki minimal 1 Workspace (bisa dicek lewat menu *🔍 Cek Token*).\n';
  t += '3. Buat token di https://railway.com/account/tokens\n';
  t += '4. Klik *➕ Add Token Railway* dan kirimkan tokenmu.\n';
  t += '5. Tekan *🚀 Buat VPS* untuk auto deploy container Ubuntu 22.04.\n';
  t += '6. Sistem akan otomatis menunggu sampai container siap dan memberikan IP numerik.\n';
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

// Fungsi pencarian workspaceId yang valid dan kompatibel dengan GraphQL Railway
async function getValidWorkspace(headers) {
  // Percobaan 1: Query workspaces via me
  try {
    const q1 = {
      query: `query {
        me {
          id
          name
          email
          workspaces {
            id
            name
          }
        }
      }`
    };
    const r1 = await axios.post('https://backboard.railway.app/graphql/v2', q1, { headers });
    const me = r1.data?.data?.me;
    const wsList = me?.workspaces;
    if (wsList && wsList.length > 0 && wsList[0].id) {
      return { wsId: wsList[0].id, wsName: wsList[0].name, me: me };
    }
    if (me) return { wsId: null, wsName: 'Personal', me: me };
  } catch (e) {}

  // Percobaan 2: Query workspaces tingkat root
  try {
    const q2 = { query: `query { workspaces { id name } }` };
    const r2 = await axios.post('https://backboard.railway.app/graphql/v2', q2, { headers });
    const ws = r2.data?.data?.workspaces;
    if (ws && ws.length > 0 && ws[0].id) {
      return { wsId: ws[0].id, wsName: ws[0].name, me: null };
    }
  } catch (e) {}

  // Percobaan 3: Query profile dasar
  try {
    const q3 = { query: `query { me { id name email } }` };
    const r3 = await axios.post('https://backboard.railway.app/graphql/v2', q3, { headers });
    return { wsId: null, wsName: 'Personal', me: r3.data?.data?.me };
  } catch (e) {}

  return { wsId: null, wsName: 'Unknown', me: null };
}

// Polling status deployment sampai SUCCESS
async function waitForDeploymentSuccess(sId, envId, headers, maxAttempts = 35) {
  const qDeploy = {
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
    variables: { serviceId: sId, environmentId: envId }
  };

  for (let i = 0; i < maxAttempts; i++) {
    await sleep(4000);
    try {
      const res = await axios.post('https://backboard.railway.app/graphql/v2', qDeploy, { headers });
      const edge = res.data?.data?.deployments?.edges?.[0];
      const status = edge?.node?.status;

      if (status === 'SUCCESS') return true;
      if (status === 'CRASHED' || status === 'FAILED') {
        throw new Error('Container gagal dijalankan (Status: ' + status + ')');
      }
    } catch (e) {
      if (e.message && e.message.includes('Status:')) throw e;
    }
  }
  return true;
}

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

  // Cek Token
  if (text === '🔍 Cek Token') {
    if (!db.tokens[id]) return bot.sendMessage(id, '⚠️ Anda belum memasukkan token Railway.');
    bot.sendMessage(id, '⏳ Memeriksa data akun dan workspace Railway...');
    try {
      const tk = db.tokens[id];
      const headers = { Authorization: 'Bearer ' + tk, 'Content-Type': 'application/json' };

      const { wsId, wsName, me } = await getValidWorkspace(headers);

      // Ambil daftar project aktif
      let projects = [];
      try {
        const qProj = { query: `query { me { projects { edges { node { id name } } } } }` };
        const resProj = await axios.post('https://backboard.railway.app/graphql/v2', qProj, { headers });
        projects = resProj.data?.data?.me?.projects?.edges || [];
      } catch (e) {}

      const totalProjects = projects.length;

      let report = `👤 *Info Akun Railway:*\n`;
      report += `- Nama: \`${me?.name || 'User'}\`\n`;
      report += `- Email: \`${me?.email || '-'}\`\n`;
      report += `- Workspace: \`${wsName}\`\n`;
      report += `- Workspace ID: \`${wsId || 'Belum Ada (Wajib Buka Web)'}\`\n\n`;
      report += `📦 *Daftar Project (${totalProjects}):*\n`;

      if (totalProjects === 0) {
        report += `_Tidak ada project (No Project - Bersih)_\n\n`;
        if (wsId) {
          report += `🟢 *Status:* *Bisa Buat VPS Baru* ✅`;
        } else {
          report += `🟡 *Status:* *Workspace ID Belum Aktif!*\nBuka https://railway.com di browser, login, dan buat 1 project / workspace agar ID aktif.`;
        }
      } else {
        projects.forEach((p, idx) => {
          report += `${idx + 1}. *${p.node.name}* (\`${p.node.id}\`)\n`;
        });
        report += `\n⚠️ Hapus project di atas lewat dashboard Railway jika ingin mendeploy VPS baru.`;
      }

      return bot.sendMessage(id, report, { parse_mode: 'Markdown' });
    } catch (err) {
      const errMsg = err.response?.data?.errors?.[0]?.message || err.message;
      return bot.sendMessage(id, '❌ *Token Tidak Valid / Error:*\n`' + errMsg + '`', { parse_mode: 'Markdown' });
    }
  }

  // Buat VPS
  if (text === '🚀 Buat VPS') {
    if (!db.tokens[id]) return bot.sendMessage(id, '⚠️ Masukkan token Railway terlebih dahulu via menu ➕ Add Token Railway.');
    const pass = genPass();
    const statusMsg = await bot.sendMessage(id, '⏳ *Sedang Menyiapkan VPS...*\nLangkah 1/4: Mendeteksi workspace & membuat project di Railway...', { parse_mode: 'Markdown' });

    try {
      const tk = db.tokens[id];
      const headers = { Authorization: 'Bearer ' + tk, 'Content-Type': 'application/json' };

      // 1. Ambil Workspace ID Wajib
      const { wsId } = await getValidWorkspace(headers);

      if (!wsId) {
        throw new Error('Akun Anda belum memiliki Workspace ID di Railway. Silakan buka https://railway.com lewat browser HP Anda, login, lalu buat 1 Workspace atau Project di web agar akun terinisialisasi.');
      }

      // 2. Buat Project Baru dengan workspaceId
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
        variables: {
          input: {
            name: `vps-${id}`,
            workspaceId: wsId
          }
        }
      };

      const resP = await axios.post('https://backboard.railway.app/graphql/v2', qP, { headers });
      if (resP.data.errors) throw new Error(resP.data.errors[0].message);

      const pData = resP.data.data.projectCreate;
      const pId = pData.id;
      const envId = pData.environments.edges[0]?.node?.id;

      await bot.editMessageText('⏳ *Sedang Menyiapkan VPS...*\nLangkah 2/4: Menyiapkan container Ubuntu 22.04 & kredensial root...', {
        chat_id: id,
        message_id: statusMsg.message_id,
        parse_mode: 'Markdown'
      });

      // 3. Buat Service Ubuntu SSH
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

      // 4. Injeksi Password Root
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

      // 5. Buka TCP Proxy Port 22 SSH
      await bot.editMessageText('⏳ *Sedang Menyiapkan VPS...*\nLangkah 3/4: Membuka TCP Proxy port 22 SSH...', {
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

      // Resolve DNS Domain Proxy ke Alamat IP Publik Numerik
      let resolvedIp = dom;
      try {
        const dnsRes = await dns.lookup(dom);
        if (dnsRes && dnsRes.address) {
          resolvedIp = dnsRes.address;
        }
      } catch (errDns) {
        resolvedIp = dom;
      }

      // 6. Tunggu deployment sampai status SUCCESS
      await bot.editMessageText('⏳ *Sedang Menyiapkan VPS...*\nLangkah 4/4: Menunggu container selesai booting & status SUCCESS...', {
        chat_id: id,
        message_id: statusMsg.message_id,
        parse_mode: 'Markdown'
      });

      await waitForDeploymentSuccess(sId, envId, headers);

      db.vps[id] = { projectId: pId, pass: pass, dom: resolvedIp, port: port };
      saveDB(db);

      let info = '🎉 *VPS Ubuntu 22.04 Berhasil Aktif & Siap Digunakan!*\n\n';
      info += '🌐 *IP Address :* `' + resolvedIp + '`\n';
      info += '🔌 *Port SSH :* `' + port + '`\n';
      info += '👤 *User :* `root`\n';
      info += '🔑 *Password :* `' + pass + '`\n\n';
      info += '📌 *Koneksi SSH:* \n`ssh root@' + resolvedIp + ' -p ' + port + '`';

      await bot.editMessageText(info, {
        chat_id: id,
        message_id: statusMsg.message_id,
        parse_mode: 'Markdown'
      });

    } catch (err) {
      console.error(err.response?.data || err.message);
      const errMsg = err.response?.data?.errors?.[0]?.message || err.message || 'Gagal deploy ke Railway.';
      return bot.sendMessage(id, '❌ *Deploy Gagal:*\n`' + errMsg + '`', { parse_mode: 'Markdown' });
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
