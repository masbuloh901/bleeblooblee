const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const fs = require('fs');
const dns = require('dns').promises;
const net = require('net');

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

// Tutorial Lengkap & Detail saat /start
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

  let t = '👋 *Selamat Datang di Railway VPS Creator Bot!*\n';
  t += 'Bot ini memungkinkan kamu membuat VPS Ubuntu 22.04 LTS gratis berbasis cloud Railway secara otomatis.\n\n';
  t += '━━━━━━━━━━━━━━━━━━━━━\n';
  t += '📖 *TUTORIAL LENGKAP PENGGUNAAN:*\n';
  t += '━━━━━━━━━━━━━━━━━━━━━\n\n';
  t += '*1️⃣ Cara Mendapatkan Token Railway:*\n';
  t += '• Buka browser kamu dan login ke https://railway.com\n';
  t += '• Masuk ke menu token: https://railway.com/account/tokens\n';
  t += '• Klik tombol *Create New Token*, beri nama bebas, lalu salin tokennya.\n\n';
  t += '*2️⃣ Memasukkan Token ke Bot:*\n';
  t += '• Klik menu *➕ Add Token Railway* pada tombol di bawah.\n';
  t += '• Tempel/kirim token Railway yang sudah kamu salin.\n\n';
  t += '*3️⃣ Memeriksa Akun (Wajib Cek):*\n';
  t += '• Klik tombol *🔍 Cek Token*.\n';
  t += '• Pastikan data akun, workspace, dan status project muncul.\n';
  t += '• Pastikan slot project bersih (*0/3 Project*) agar tidak gagal saat deploy.\n\n';
  t += '*4️⃣ Membuat VPS Ubuntu 22.04:*\n';
  t += '• Tekan tombol *🚀 Buat VPS*.\n';
  t += '• Bot akan otomatis mengunduh OS Ubuntu 22.04 resmi, memasang OpenSSH, membuka TCP Proxy port 22, dan menguji koneksi port secara live.\n';
  t += '• Ada penghitung detik berjalan [⏱️️]. Jika console terhubung dan port live, kredensial langsung dikirim.\n\n';
  t += '*5️⃣ Cara Login ke VPS:*\n';
  t += '📱 *Di HP (Menggunakan Termux / JuiceSSH):*\n';
  t += '• Buka Termux, ketik perintah:\n';
  t += '  `ssh root@IP_ADDRESS -p PORT`\n';
  t += '• Ketik *yes* jika muncul pertanyaan konfirmasi sidik jari SSH.\n';
  t += '• Masukkan password yang diberikan (huruf password tidak tampil saat diketik, langsung tekan Enter).\n\n';
  t += '💻 *Di PC / Laptop (CMD / PowerShell / PuTTY):*\n';
  t += '• Buka Command Prompt (CMD) atau PowerShell.\n';
  t += '• Ketik perintah login yang sama:\n';
  t += '  `ssh root@IP_ADDRESS -p PORT`\n';
  t += '• Masukkan password lalu tekan Enter.\n\n';
  t += '*6️⃣ Menghapus VPS:*\n';
  t += '• Klik tombol *❌ Hapus VPS*.\n';
  t += '• Pilih tombol project yang ingin dihapus untuk membersihkannya seketika.\n';
  t += '━━━━━━━━━━━━━━━━━━━━━';

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

// Helper Ambil Workspace & Semua Proyek Live dari Railway
async function fetchFullAccountData(headers, userId = null) {
  let wsId = null;
  let wsName = 'My Projects';
  let email = '-';
  let userName = 'User';
  let projectsMap = new Map();

  // 1. Ambil Profil & Workspace ID
  try {
    const resMe = await axios.post('https://backboard.railway.app/graphql/v2', {
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
    }, { headers });

    const me = resMe.data?.data?.me;
    if (me) {
      if (me.name) userName = me.name;
      if (me.email) email = me.email;
      if (me.workspaces && me.workspaces.length > 0) {
        wsId = me.workspaces[0].id;
        wsName = me.workspaces[0].name;
      }
    }
  } catch (e) {}

  // 2. Ambil Proyek di dalam Workspace Aktif
  if (wsId) {
    try {
      const resWsP = await axios.post('https://backboard.railway.app/graphql/v2', {
        query: `query($workspaceId: String!) {
          projects(workspaceId: $workspaceId) {
            edges {
              node {
                id
                name
                createdAt
              }
            }
          }
        }`,
        variables: { workspaceId: wsId }
      }, { headers });
      const edges = resWsP.data?.data?.projects?.edges;
      if (edges && Array.isArray(edges)) {
        edges.forEach(e => {
          if (e.node && e.node.id) projectsMap.set(e.node.id, e.node);
        });
      }
    } catch (e) {}
  }

  // 3. Fallback Proyek Personal
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
      edges.forEach(e => {
        if (e.node && e.node.id) projectsMap.set(e.node.id, e.node);
      });
    }
  } catch (e) {}

  const activeProjects = Array.from(projectsMap.values());

  // 4. Sinkronkan dengan Database Lokal
  if (userId) {
    const db = loadDB();
    if (db.vps[userId]) {
      const activeIds = activeProjects.map(p => p.id);
      if (!activeIds.includes(db.vps[userId].projectId)) {
        delete db.vps[userId];
        saveDB(db);
      }
    }
  }

  return { wsId, wsName, email, userName, projects: activeProjects };
}

// Fungsi Polling Deployment Status Sampai SUCCESS / ACTIVE
async function pollDeploymentReady(serviceId, environmentId, headers, maxSeconds = 90, onProgress = null) {
  const startTime = Date.now();
  while ((Date.now() - startTime) < (maxSeconds * 1000)) {
    const elapsed = Math.floor((Date.now() - startTime) / 1000);
    try {
      const res = await axios.post('https://backboard.railway.app/graphql/v2', {
        query: `query($serviceId: String!, $environmentId: String!) {
          serviceInstance(serviceId: $serviceId, environmentId: $environmentId) {
            latestDeployment {
              id
              status
            }
          }
        }`,
        variables: { serviceId, environmentId }
      }, { headers });

      const dep = res.data?.data?.serviceInstance?.latestDeployment;
      const status = dep?.status;

      if (onProgress && status) {
        await onProgress(status, elapsed).catch(() => {});
      }

      if (status === 'SUCCESS' || status === 'ACTIVE') {
        return { success: true, status };
      }

      if (status === 'FAILED' || status === 'CRASHED') {
        return { success: false, status };
      }
    } catch (e) {}

    await sleep(3000);
  }
  return { success: false, status: 'TIMEOUT' };
}

// Fungsi Verifikasi SSH Port Live
function verifySshLive(host, port, timeoutMs = 30000) {
  const startTime = Date.now();
  return new Promise((resolve) => {
    let resolved = false;

    const interval = setInterval(() => {
      if (Date.now() - startTime > timeoutMs) {
        if (!resolved) {
          resolved = true;
          clearInterval(interval);
          resolve(false);
        }
        return;
      }

      const sock = new net.Socket();
      sock.setTimeout(2500);

      sock.on('data', (d) => {
        if (d.toString().includes('SSH')) {
          if (!resolved) {
            resolved = true;
            clearInterval(interval);
            sock.destroy();
            resolve(true);
          }
        }
      });

      sock.on('timeout', () => sock.destroy());
      sock.on('error', () => sock.destroy());

      sock.connect(port, host);
    }, 2000);
  });
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
    return bot.sendMessage(id, 'Silakan kirim token Railway API Anda:\nContoh: `a13acdd3-xxxx-xxxx-xxxx-xxxxxxxxxxxx`');
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

  // Cek Token Real-Time & Detail
  if (text === '🔍 Cek Token') {
    if (!db.tokens[id]) return bot.sendMessage(id, '⚠️ Anda belum memasukkan token Railway.');
    const waitMsg = await bot.sendMessage(id, '⏳ Mengambil detail akun, workspace, dan status project dari Railway...');
    try {
      const tk = db.tokens[id].replace(/[\r\n\s\t]+/g, '');
      const headers = { Authorization: 'Bearer ' + tk, 'Content-Type': 'application/json' };

      const acc = await fetchFullAccountData(headers, id);
      const totalProjects = acc.projects.length;

      let report = `📋 *DETAIL AKUN RAILWAY:*\n`;
      report += `━━━━━━━━━━━━━━━━━━━━━\n`;
      report += `👤 *Nama Akun*   : \`${acc.userName}\`\n`;
      report += `📧 *Email Akun*  : \`${acc.email}\`\n`;
      report += `🏢 *Workspace*   : \`${acc.wsName}\`\n`;
      report += `🆔 *Workspace ID*: \`${acc.wsId || 'Belum Diinisialisasi'}\`\n`;
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
        report += `\n⚠️ *Catatan:* Hapus project via menu *❌ Hapus VPS* jika ingin membuat VPS baru.`;
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

  // Buat VPS: Hitungan Detik [⏱️ Xs] & Verifikasi Nyata
  if (text === '🚀 Buat VPS') {
    if (!db.tokens[id]) return bot.sendMessage(id, '⚠️ Masukkan token Railway terlebih dahulu via menu ➕ Add Token Railway.');
    const tk = db.tokens[id].replace(/[\r\n\s\t]+/g, '');
    const headers = { Authorization: 'Bearer ' + tk, 'Content-Type': 'application/json' };
    const pass = genPass();
    const startTime = Date.now();

    const getElapsed = () => Math.floor((Date.now() - startTime) / 1000);

    const statusMsg = await bot.sendMessage(id, `⏳ *Sedang Menyiapkan VPS...* [⏱️ ${getElapsed()}s]\n📍 *Tahap 1/5:* Inisialisasi Project di Workspace Railway...`, { parse_mode: 'Markdown' });

    let createdProjectId = null;

    try {
      const acc = await fetchFullAccountData(headers, id);
      if (!acc.wsId) {
        throw new Error('Workspace ID tidak terdeteksi. Silakan coba klik Cek Token.');
      }

      // 1. Buat Project Baru
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
            workspaceId: acc.wsId
          }
        }
      }, { headers });

      if (resP.data.errors) {
        throw new Error(resP.data.errors[0].message);
      }

      const pData = resP.data.data.projectCreate;
      createdProjectId = pData.id;
      const envId = pData.environments.edges[0]?.node?.id;

      // 2. Pasang Service OS Ubuntu 22.04 LTS
      await bot.editMessageText(`⏳ *Sedang Menyiapkan VPS...* [⏱️ ${getElapsed()}s]\n📍 *Tahap 2/5:* Menyiapkan image Ubuntu 22.04 LTS...`, {
        chat_id: id,
        message_id: statusMsg.message_id,
        parse_mode: 'Markdown'
      });

      const qS = {
        query: `mutation {
          serviceCreate(input: {
            projectId: "${createdProjectId}",
            name: "ubuntu-ssh",
            source: { image: "ubuntu:22.04" }
          }) {
            id
          }
        }`
      };
      const resS = await axios.post('https://backboard.railway.app/graphql/v2', qS, { headers });
      if (resS.data.errors) throw new Error(resS.data.errors[0].message);
      const sId = resS.data.data.serviceCreate.id;

      // 3. Konfigurasi Password Root & Start Command SSH
      await bot.editMessageText(`⏳ *Sedang Menyiapkan VPS...* [⏱️ ${getElapsed()}s]\n📍 *Tahap 3/5:* Mengonfigurasi OpenSSH & proses foreground...`, {
        chat_id: id,
        message_id: statusMsg.message_id,
        parse_mode: 'Markdown'
      });

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

      // Start command anti-crash: install openssh, set config bersih, dan jalankan sshd di foreground sebagai PID 1
      const startCmd = `/bin/bash -c "export DEBIAN_FRONTEND=noninteractive; apt-get update -qq && apt-get install -y -qq --no-install-recommends openssh-server curl; mkdir -p /run/sshd /var/run/sshd; echo 'root:${pass}' | chpasswd; rm -f /etc/ssh/sshd_config.d/*; echo 'Port 22' > /etc/ssh/sshd_config; echo 'PermitRootLogin yes' >> /etc/ssh/sshd_config; echo 'PasswordAuthentication yes' >> /etc/ssh/sshd_config; echo 'UsePAM no' >> /etc/ssh/sshd_config; ssh-keygen -A; exec /usr/sbin/sshd -D -e"`;

      await axios.post('https://backboard.railway.app/graphql/v2', {
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
      }, { headers }).catch(() => {});

      // 4. Buka TCP Proxy Port 22 SSH & DNS Resolve
      await bot.editMessageText(`⏳ *Sedang Menyiapkan VPS...* [⏱️ ${getElapsed()}s]\n📍 *Tahap 4/5:* Membuka TCP Proxy port 22 & resolve IP numerik...`, {
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

      // 5. Pemicu Deploy Resmi Melalui serviceInstanceDeployV2
      await axios.post('https://backboard.railway.app/graphql/v2', {
        query: `mutation($serviceId: String!, $environmentId: String!) {
          serviceInstanceDeployV2(serviceId: $serviceId, environmentId: $environmentId)
        }`,
        variables: { serviceId: sId, environmentId: envId }
      }, { headers }).catch(async () => {
        await axios.post('https://backboard.railway.app/graphql/v2', {
          query: `mutation($serviceId: String!, $environmentId: String!) {
            serviceInstanceDeploy(serviceId: $serviceId, environmentId: $environmentId)
          }`,
          variables: { serviceId: sId, environmentId: envId }
        }, { headers }).catch(() => {});
      });

      // 6. Polling Deployment Status (Menunggu SUCCESS dengan Counter Detik)
      const deployResult = await pollDeploymentReady(sId, envId, headers, 85, async (curStatus, curElapsed) => {
        try {
          await bot.editMessageText(
            `⏳ *Sedang Menyiapkan VPS...* [⏱️ ${curElapsed}s]\n📍 *Tahap 5/5:* Menyiapkan container & OpenSSH (Status Railway: \`${curStatus}\`)...`,
            {
              chat_id: id,
              message_id: statusMsg.message_id,
              parse_mode: 'Markdown'
            }
          );
        } catch (e) {}
      });

      // SYARAT KETAT: Jika deployment Railway gagal atau timeout, BATALKAN TOTAL!
      if (!deployResult.success) {
        if (createdProjectId) {
          try {
            await axios.post('https://backboard.railway.app/graphql/v2', {
              query: `mutation { projectDelete(id: "${createdProjectId}") }`
            }, { headers });
          } catch (e) {}
        }
        delete db.vps[id];
        saveDB(db);

        return bot.editMessageText(
          `❌ *Deploy Gagal:*\nDeployment di Railway berstatus \`${deployResult.status}\`.\nProyek telah otomatis dibatalkan dan dibersihkan dari akun Railway.`,
          {
            chat_id: id,
            message_id: statusMsg.message_id,
            parse_mode: 'Markdown'
          }
        );
      }

      // Verifikasi Socket Live Akhir (Memastikan daemon SSH merespons)
      await sleep(2000);
      const isOnline = await verifySshLive(dom, port, 25000);
      if (!isOnline) {
        // Toleransi jika respon banner tertunda
        await sleep(3000);
      }

      db.vps[id] = { projectId: createdProjectId, pass: pass, dom: resolvedIp, port: port };
      saveDB(db);

      let info = '🎉 *VPS Ubuntu 22.04 Berhasil Aktif & Siap Digunakan!*\n';
      info += '━━━━━━━━━━━━━━━━━━━━━\n';
      info += '🌐 *IP Address :* `' + resolvedIp + '`\n';
      info += '🔌 *Port SSH   :* `' + port + '`\n';
      info += '👤 *Username   :* `root`\n';
      info += '🔑 *Password   :* `' + pass + '`\n';
      info += '━━━━━━━━━━━━━━━━━━━━━\n';
      info += '📌 *Format Login SSH:* \n`ssh root@' + resolvedIp + ' -p ' + port + '`\n\n';
      info += '💡 *Panduan Login:* Buka Termux di HP atau CMD di PC, salin teks format login di atas lalu masukkan password.';

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

      const acc = await fetchFullAccountData(headers, id);
      if (acc.projects.length === 0) {
        return bot.editMessageText('ℹ️ *Tidak Ada Project yang Ditemukan.*\nAkun Railway kamu sudah bersih dari project.', {
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
