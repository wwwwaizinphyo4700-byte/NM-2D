import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import { createClient } from '@supabase/supabase-js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

app.use(express.json());

// Persistent database path
const DB_DIR = path.join(__dirname, 'data');
const DB_FILE = path.join(DB_DIR, 'db.json');

if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
}

// User's Supabase credentials (uses Master service_role key on backend for full admin permissions)
const supabaseUrl = process.env.SUPABASE_URL || 'https://iihpjvvxrcadctyfmxqg.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || 'sb_publishable_4w0Fv5gpMvW7rDpdiBm1Iw_PWpbWu-5';
const supabase = (supabaseUrl && supabaseKey && !supabaseUrl.includes('your-project'))
  ? createClient(supabaseUrl, supabaseKey)
  : null;

interface DBData {
  users: Array<{
    id: string;
    username: string;
    password: string;
    name: string;
    balance: number;
    role: 'admin' | 'user';
    createdAt: string;
  }>;
  bets2D: Array<{
    id: string;
    userId: string;
    username: string;
    date: string;
    time: string;
    section: '12:01 PM' | '04:30 PM';
    number: string;
    multiplier: number;
    amount: number;
    status: 'pending' | 'win' | 'lose' | 'cancelled_by_admin';
    winAmount: number;
    commission: number;
    netAmount: number;
    resultNumber?: string;
    createdAt: string;
  }>;
  bets3D: Array<{
    id: string;
    userId: string;
    username: string;
    date: string;
    time: string;
    number: string;
    multiplier: number;
    amount: number;
    status: 'pending' | 'win' | 'lose' | 'cancelled_by_admin';
    winAmount: number;
    commission: number;
    netAmount: number;
    resultNumber?: string;
    createdAt: string;
  }>;
  settings: {
    serverOnline: boolean;
    maintenanceMessage: string;
    betting2D_enabled: boolean;
    betting3D_enabled: boolean;
    closedNumbers2D_1201: string[];
    closedNumbers2D_1630: string[];
    closedNumbers3D: string[];
    customLimits2D_1201?: Record<string, number>;
    customLimits2D_1630?: Record<string, number>;
    customLimits3D?: Record<string, number>;
    limit2D: number;
    limit3D: number;
    closeTime2D_1201: string; // "11:50 AM"
    closeTime2D_1630: string; // "03:50 PM"
    closeTime3D: string;
    closeDays2D: string[]; // ["Saturday", "Sunday"]
    multiplier2D: number;
    commissionRate2D: number;
    multiplier3D: number;
    multiplier3D_toot?: number;
    multiplier3D_chai?: number;
    commissionRate3D: number;
    official3DResults: Record<string, string>;
    manual3DResult: string;
    announcement: string;
    minVersion: string;
    serviceLink1: { label: string; url: string };
    serviceLink2: { label: string; url: string };
  };
}

const defaultDB: DBData = {
  users: [
    {
      id: 'admin-1',
      username: 'admin',
      password: '123456',
      name: 'System Admin',
      balance: 1000000,
      role: 'admin',
      createdAt: new Date().toISOString(),
    },
    {
      id: 'user-1',
      username: 'player01',
      password: '123456',
      name: 'Member 01',
      balance: 100000,
      role: 'user',
      createdAt: new Date().toISOString(),
    }
  ],
  bets2D: [],
  bets3D: [],
  settings: {
    serverOnline: true,
    maintenanceMessage: 'System is currently undergoing routine maintenance. Please check back shortly.',
    betting2D_enabled: true,
    betting3D_enabled: true,
    closedNumbers2D_1201: ['18', '24', '79', '99'],
    closedNumbers2D_1630: ['05', '33', '88'],
    closedNumbers3D: [],
    customLimits2D_1201: {},
    customLimits2D_1630: {},
    customLimits3D: {},
    limit2D: 100000,
    limit3D: 50000,
    closeTime2D_1201: '11:50 AM',
    closeTime2D_1630: '03:50 PM',
    closeTime3D: '02:30 PM',
    closeDays2D: ['Saturday', 'Sunday'],
    multiplier2D: 80,
    commissionRate2D: 0.12,
    multiplier3D: 500,
    multiplier3D_toot: 10,
    multiplier3D_chai: 10,
    commissionRate3D: 0.10,
    official3DResults: {},
    manual3DResult: '',
    announcement: 'Welcome to NM 2D Official • Live Thai Stock 2D & 3D System • 12:01 PM & 4:30 PM Sections • 3D 500x Multiplier',
    minVersion: '1.0.0',
    serviceLink1: { label: 'Viber Support (09781187965)', url: 'viber://chat?number=%2B959781187965' },
    serviceLink2: { label: 'Telegram Support (@zussio2)', url: 'https://t.me/zussio2' },
  },
};

function readDB(): DBData {
  try {
    if (!fs.existsSync(DB_FILE)) {
      fs.writeFileSync(DB_FILE, JSON.stringify(defaultDB, null, 2), 'utf-8');
      return defaultDB;
    }
    const content = fs.readFileSync(DB_FILE, 'utf-8');
    const data = JSON.parse(content);
    return {
      ...defaultDB,
      ...data,
      settings: { ...defaultDB.settings, ...(data.settings || {}) },
    };
  } catch (err) {
    console.error('Error reading db.json:', err);
    return defaultDB;
  }
}

// Background sync to Supabase tables when available
async function syncToSupabase(data: DBData) {
  if (!supabase) return;
  try {
    // 1. Sync settings
    await supabase.from('app_settings').upsert({
      id: 'current',
      settings_json: data.settings,
      updated_at: new Date().toISOString(),
    }).select();
  } catch (e) {
    // Ignore schema errors if user hasn't run the SQL migration yet
  }
}

function writeDB(data: DBData) {
  try {
    // Permanent storage - do NOT auto-prune records unless explicitly deleted by Admin
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf-8');
    syncToSupabase(data);
  } catch (err) {
    console.error('Error writing db.json:', err);
  }
}

function getMMTDateTime(): Date {
  const now = new Date();
  const utc = now.getTime() + now.getTimezoneOffset() * 60000;
  return new Date(utc + 6.5 * 3600000);
}

function isWeekend(d = getMMTDateTime(), closeDays = ['Saturday', 'Sunday']): boolean {
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const currentDayName = days[d.getDay()];
  return closeDays.includes(currentDayName);
}

// Settle 2D bets internally
function settle2DBets(date: string, section: '12:01 PM' | '04:30 PM', resultNumber: string) {
  if (!resultNumber || resultNumber === '--' || resultNumber.length !== 2) return;
  const db = readDB();
  let changed = false;

  db.bets2D.forEach((bet) => {
    if (bet.date === date && bet.section === section && bet.status === 'pending') {
      bet.resultNumber = resultNumber;
      if (bet.number === resultNumber) {
        bet.status = 'win';
        bet.winAmount = bet.amount * bet.multiplier;
        bet.netAmount = bet.winAmount + bet.commission - bet.amount;

        const user = db.users.find((u) => u.id === bet.userId);
        if (user) {
          user.balance += (bet.winAmount + bet.commission);
        }
      } else {
        bet.status = 'lose';
        bet.winAmount = 0;
        bet.netAmount = bet.commission - bet.amount;

        const user = db.users.find((u) => u.id === bet.userId);
        if (user) {
          user.balance += bet.commission;
        }
      }
      changed = true;
    }
  });

  if (changed) {
    writeDB(db);
  }
  const winnersCount = db.bets2D.filter((b) => b.date === date && b.section === section && b.status === 'win' && b.resultNumber === resultNumber).length;
  return winnersCount;
}

// 3D Winning logic:
// Direct match (ဒဲ့): 500x
// Permutations / Toot (ပတ်လည်): 10x
// Adjacent / Chai (အနီးစပ် / ချာ: +/- 1): 10x
function generate3DPermutationsServer(input: string): string[] {
  const digits = input.trim();
  if (digits.length !== 3) return [digits];
  const results = new Set<string>();
  const arr = digits.split('');

  function permute(subArr: string[], memo: string[] = []) {
    if (subArr.length === 0) {
      results.add(memo.join(''));
    } else {
      for (let i = 0; i < subArr.length; i++) {
        const curr = subArr.slice();
        const next = curr.splice(i, 1);
        permute(curr.slice(), memo.concat(next));
      }
    }
  }

  permute(arr);
  return Array.from(results);
}

function calculate3DWinServer(
  betNumber: string,
  resultNumber: string,
  multiplierDirect = 500,
  multiplierToot = 10,
  multiplierAdjacent = 10
) {
  if (!resultNumber || resultNumber.trim().length !== 3 || !betNumber || betNumber.trim().length !== 3) {
    return { isWin: false, winType: null, multiplier: 0, label: 'ရှုံး' };
  }

  const b = betNumber.trim();
  const r = resultNumber.trim();

  // 1. Direct (ဒဲ့) -> 500ဆ
  if (b === r) {
    return { isWin: true, winType: 'direct' as const, multiplier: multiplierDirect, label: `👑 ဒဲ့ပေါက် (${multiplierDirect}ဆ)` };
  }

  // 2. Toot / Permutations (ပတ်လည်) -> 10ဆ
  // E.g. For 456: 654, 645, 546, 564, 465
  const perms = generate3DPermutationsServer(r).filter((p) => p !== r);
  if (perms.includes(b)) {
    return { isWin: true, winType: 'toot' as const, multiplier: multiplierToot, label: `🔄 ပတ်လည်ပေါက် (${multiplierToot}ဆ)` };
  }

  // 3. Adjacent / Chai (အနီးစပ် / ချာ: +/- 1) -> 10ဆ
  // E.g. For 456: 457 and 455
  const val = parseInt(r, 10);
  const plus1 = ((val + 1) % 1000).toString().padStart(3, '0');
  const minus1 = ((val - 1 + 1000) % 1000).toString().padStart(3, '0');

  if (b === plus1 || b === minus1) {
    return { isWin: true, winType: 'adjacent' as const, multiplier: multiplierAdjacent, label: `🎯 အနီးစပ်/ချာပေါက် (${multiplierAdjacent}ဆ)` };
  }

  return { isWin: false, winType: null, multiplier: 0, label: 'ရှုံး' };
}

let liveCache: any = null;
let lastFetchTime = 0;

// API route to get Thai 2D Live Data
app.get('/api/live', async (req, res) => {
  const db = readDB();
  const mmt = getMMTDateTime();
  const weekend = isWeekend(mmt, db.settings.closeDays2D);

  // If closed day: Stock market is closed. Keep static closed display without polling!
  if (weekend) {
    return res.json({
      isMarketClosed: true,
      marketStatus: 'Closed (Weekend)',
      live: {
        set: '1,626.27',
        value: '85,650.24',
        time: 'Market Closed (Saturday & Sunday)',
        twod: '--',
      },
      result: [
        { open_time: '12:01:00', twod: '--', set: 'Closed', value: 'Closed' },
        { open_time: '16:30:00', twod: '--', set: 'Closed', value: 'Closed' },
      ],
    });
  }

  const now = Date.now();
  if (liveCache && now - lastFetchTime < 5000) {
    return res.json(liveCache);
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);
    const response = await fetch('https://api.thaistock2d.com/live', {
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; NM-2D-App/1.0)' },
    });
    clearTimeout(timeout);

    if (response.ok) {
      const data = await response.json();
      if (data && data.live) {
        liveCache = { ...data, isMarketClosed: false };
        lastFetchTime = now;

        // Check if results are in and trigger automated settlement!
        const pad = (n: number) => n.toString().padStart(2, '0');
        const todayDate = `${pad(mmt.getDate())}-${pad(mmt.getMonth() + 1)}-${mmt.getFullYear()}`;

        const r1201 = data.result?.find((r: any) => r.open_time.startsWith('12:01'))?.twod;
        if (r1201 && r1201 !== '--') {
          settle2DBets(todayDate, '12:01 PM', r1201);
        }

        const r1630 = data.result?.find((r: any) => r.open_time.startsWith('16:30'))?.twod;
        if (r1630 && r1630 !== '--') {
          settle2DBets(todayDate, '04:30 PM', r1630);
        }

        return res.json(liveCache);
      }
    }
  } catch (e) {
    // Silent fallback
  }

  // Weekday market hours fallback
  const pad = (n: number) => n.toString().padStart(2, '0');
  const dateStr = `${mmt.getFullYear()}-${pad(mmt.getMonth() + 1)}-${pad(mmt.getDate())} ${pad(mmt.getHours())}:${pad(mmt.getMinutes())}:${pad(mmt.getSeconds())}`;
  
  const currentMin = mmt.getHours() * 60 + mmt.getMinutes();
  const is1201Ready = currentMin >= 721;
  const is1630Ready = currentMin >= 990;

  const fallbackData = {
    isMarketClosed: false,
    live: {
      set: '1,421.45',
      value: '38,760.18',
      time: dateStr,
      twod: is1201Ready ? '58' : '22',
    },
    result: [
      {
        set: is1201Ready ? '1,421.45' : '--',
        value: is1201Ready ? '38,760.18' : '--',
        open_time: '12:01:00',
        twod: is1201Ready ? '58' : '--',
      },
      {
        set: is1630Ready ? '1,420.95' : '--',
        value: is1630Ready ? '71,450.65' : '--',
        open_time: '16:30:00',
        twod: is1630Ready ? '55' : '--',
      },
    ],
  };

  liveCache = fallbackData;
  lastFetchTime = now;
  res.json(fallbackData);
});

// Login endpoint
app.post('/api/auth/login', async (req, res) => {
  const cleanUsername = String(req.body.username || '').trim();
  const cleanPassword = String(req.body.password || '').trim();
  const db = readDB();

  // Check if server is offline for regular users
  if (db.settings.serverOnline === false) {
    const isMasterAdmin = cleanUsername.toLowerCase() === 'admin';
    const isLocalAdmin = db.users.some(
      (u) => u.username.toLowerCase() === cleanUsername.toLowerCase() && u.role === 'admin'
    );
    if (!isMasterAdmin && !isLocalAdmin) {
      return res.status(503).json({
        success: false,
        message: db.settings.maintenanceMessage || 'Server under maintenance',
        serverOffline: true,
      });
    }
  }

  let user = db.users.find(
    (u) => u.username.toLowerCase() === cleanUsername.toLowerCase() && u.password === cleanPassword
  );

  // If Supabase is available, sync user from Supabase directly
  if (supabase) {
    try {
      const { data: suUser } = await supabase
        .from('users')
        .select('*')
        .ilike('username', cleanUsername)
        .eq('password', cleanPassword)
        .maybeSingle();

      if (suUser) {
        if (!user) {
          user = {
            id: suUser.id,
            username: suUser.username,
            password: suUser.password,
            name: suUser.name || suUser.username,
            balance: Number(suUser.balance),
            role: suUser.role as 'admin' | 'user',
            createdAt: suUser.created_at,
          };
          db.users.push(user);
          writeDB(db);
        } else {
          user.balance = Number(suUser.balance);
          user.role = suUser.role as 'admin' | 'user';
          user.name = suUser.name || user.name;
        }
      }
    } catch (e) {
      // Fallback to local
    }
  }

  if (!user) {
    return res.status(401).json({ success: false, message: 'Invalid username or password' });
  }

  res.json({
    success: true,
    user: {
      id: user.id,
      username: user.username,
      name: user.name,
      balance: user.balance,
      role: user.role,
    },
  });
});

// Create user
app.post('/api/users/create', async (req, res) => {
  const cleanUsername = String(req.body.username || '').trim();
  const cleanPassword = String(req.body.password || '').trim();
  const { name, balance, role, phone } = req.body;

  if (!cleanUsername || !cleanPassword) {
    return res.status(400).json({ success: false, message: 'Username and password required' });
  }

  const db = readDB();
  if (db.users.some((u) => u.username.toLowerCase() === cleanUsername.toLowerCase())) {
    return res.status(400).json({ success: false, message: 'Username already exists' });
  }

  const newUser = {
    id: `user-${Date.now()}`,
    username: cleanUsername,
    password: cleanPassword,
    name: name ? String(name).trim() : cleanUsername,
    balance: Number(balance) || 100000,
    role: (role === 'admin' ? 'admin' : 'user') as 'admin' | 'user',
    createdAt: new Date().toISOString(),
  };

  db.users.push(newUser);
  writeDB(db);

  // Sync with Supabase users table
  if (supabase) {
    try {
      await supabase.from('users').insert({
        id: newUser.id,
        username: newUser.username,
        password: newUser.password,
        name: newUser.name,
        balance: newUser.balance,
        role: newUser.role,
        status: 'active',
        phone: phone || null,
        created_at: newUser.createdAt,
      });
    } catch (e) {
      // Ignored if table not created yet
    }
  }

  res.json({ success: true, user: newUser });
});

// List users
app.get('/api/users', async (req, res) => {
  const db = readDB();

  // If supabase available, refresh balances
  if (supabase) {
    try {
      const { data: suUsers } = await supabase.from('users').select('*');
      if (suUsers && suUsers.length > 0) {
        suUsers.forEach((su) => {
          const match = db.users.find((u) => u.id === su.id);
          if (match) {
            match.balance = Number(su.balance);
          } else {
            db.users.push({
              id: su.id,
              username: su.username,
              password: su.password,
              name: su.name || su.username,
              balance: Number(su.balance),
              role: su.role,
              createdAt: su.created_at,
            });
          }
        });
      }
    } catch (e) {}
  }

  res.json(db.users.map(({ password, ...rest }) => rest));
});

// Get user info and balance
app.get('/api/users/:id', async (req, res) => {
  const db = readDB();
  let user = db.users.find((u) => u.id === req.params.id);

  if (supabase) {
    try {
      const { data: suUser } = await supabase.from('users').select('*').eq('id', req.params.id).maybeSingle();
      if (suUser) {
        if (user) {
          user.balance = Number(suUser.balance);
          user.role = suUser.role;
        } else {
          user = {
            id: suUser.id,
            username: suUser.username,
            password: suUser.password,
            name: suUser.name || suUser.username,
            balance: Number(suUser.balance),
            role: suUser.role,
            createdAt: suUser.created_at,
          };
          db.users.push(user);
        }
      }
    } catch (e) {}
  }

  if (!user) return res.status(404).json({ message: 'User not found' });
  res.json({
    id: user.id,
    username: user.username,
    name: user.name,
    balance: user.balance,
    role: user.role,
  });
});

// Adjust user balance (with wallet_transactions tracking)
app.post('/api/users/:id/balance', async (req, res) => {
  const { amount, action, remark } = req.body; // action: 'add' | 'subtract' | 'set'
  const db = readDB();
  const user = db.users.find((u) => u.id === req.params.id);
  if (!user) return res.status(404).json({ message: 'User not found' });

  const num = Number(amount);
  if (isNaN(num)) return res.status(400).json({ message: 'Invalid amount' });

  const prevBalance = user.balance;

  if (action === 'add') {
    user.balance += num;
  } else if (action === 'subtract') {
    user.balance = Math.max(0, user.balance - num);
  } else {
    user.balance = num;
  }

  writeDB(db);

  // Sync to Supabase
  if (supabase) {
    try {
      await supabase.from('users').update({ balance: user.balance }).eq('id', user.id);
      await supabase.from('wallet_transactions').insert({
        id: `tx-${Date.now()}`,
        user_id: user.id,
        username: user.username,
        type: action === 'add' ? 'deposit' : 'withdraw',
        amount: num,
        previous_balance: prevBalance,
        new_balance: user.balance,
        remark: remark || (action === 'add' ? 'Admin Deposit' : 'Admin Withdraw'),
        created_by: 'admin',
      });
    } catch (e) {
      console.error('Supabase wallet transaction sync error:', e);
    }
  }

  res.json({ success: true, balance: user.balance });
});

// Delete user account (Admin action)
const handleDeleteUserAccount = async (req: express.Request, res: express.Response) => {
  const { id } = req.params;
  const db = readDB();
  const index = db.users.findIndex((u) => u.id === id);
  if (index === -1) {
    return res.status(404).json({ success: false, message: 'User not found' });
  }

  const userToDelete = db.users[index];

  // Delete from users list
  db.users.splice(index, 1);

  // Permanently purge all bets & ledger records belonging to this user
  db.bets2D = db.bets2D.filter((b) => b.userId !== id);
  db.bets3D = db.bets3D.filter((b) => b.userId !== id);

  writeDB(db);

  // Sync delete with Supabase
  if (supabase) {
    try {
      await supabase.from('users').delete().eq('id', id);
      await supabase.from('bets_2d').delete().eq('user_id', id);
      await supabase.from('bets_3d').delete().eq('user_id', id);
    } catch (e) {
      console.error('Supabase delete user error:', e);
    }
  }

  res.json({
    success: true,
    message: `Account @${userToDelete.username} and all associated bet histories deleted permanently.`,
    deletedId: id,
  });
};

app.delete('/api/users/:id', handleDeleteUserAccount);
app.post('/api/users/:id/delete', handleDeleteUserAccount);

// Admin Purge / Clear History endpoint (saves Supabase & DB storage on demand)
app.post('/api/admin/clear-history', async (req: express.Request, res: express.Response) => {
  const { userId, date, clearAllSettled } = req.body;
  const db = readDB();

  let initialCount = db.bets2D.length + db.bets3D.length;

  if (clearAllSettled) {
    // Clear all completed/settled bets across all users (keeps only pending bets)
    db.bets2D = db.bets2D.filter((b) => b.status === 'pending');
    db.bets3D = db.bets3D.filter((b) => b.status === 'pending');
  } else if (userId) {
    // Clear all completed bets for a specific user
    db.bets2D = db.bets2D.filter((b) => b.userId !== userId || b.status === 'pending');
    db.bets3D = db.bets3D.filter((b) => b.userId !== userId || b.status === 'pending');
  } else if (date) {
    // Clear completed bets for a specific date
    db.bets2D = db.bets2D.filter((b) => b.date !== date || b.status === 'pending');
    db.bets3D = db.bets3D.filter((b) => b.date !== date || b.status === 'pending');
  }

  const removedCount = initialCount - (db.bets2D.length + db.bets3D.length);
  writeDB(db);

  res.json({
    success: true,
    message: `အနိုင်/အရှုံး ရှင်းတမ်းပြီးသော စာရင်း ${removedCount} ခုကို အောင်မြင်စွာ ရှင်းလင်းပြီးပါပြီ။`,
    removedCount,
  });
});

// Admin Reset Closed Numbers endpoint
app.post('/api/admin/reset-closed', (req: express.Request, res: express.Response) => {
  const { section } = req.body;
  const db = readDB();

  if (section === '12:01 PM' || section === 'all') {
    db.settings.closedNumbers2D_1201 = [];
    db.settings.customLimits2D_1201 = {};
  }
  if (section === '04:30 PM' || section === 'all') {
    db.settings.closedNumbers2D_1630 = [];
    db.settings.customLimits2D_1630 = {};
  }
  if (section === '3d' || section === 'all') {
    db.settings.closedNumbers3D = [];
    db.settings.customLimits3D = {};
  }

  writeDB(db);
  res.json({
    success: true,
    settings: db.settings,
    message: `${section} ပိတ်ဂဏန်းနှင့် Limit များကို အသစ်ပြန်လည် ရှင်းလင်းဖွင့်လှစ်ပြီးပါပြီ။`,
  });
});

// Get settings
app.get('/api/settings', (req, res) => {
  const db = readDB();
  res.json(db.settings);
});

// Update settings
app.post('/api/settings', async (req, res) => {
  const db = readDB();
  db.settings = { ...db.settings, ...req.body };
  writeDB(db);

  if (supabase) {
    try {
      await supabase.from('app_settings').upsert({
        id: 'current',
        server_online: db.settings.serverOnline,
        maintenance_message: db.settings.maintenanceMessage,
        close_time_2d_1201: db.settings.closeTime2D_1201,
        close_time_2d_1630: db.settings.closeTime2D_1630,
        close_time_3d: db.settings.closeTime3D,
        close_days_2d: db.settings.closeDays2D,
        multiplier_2d: db.settings.multiplier2D,
        commission_rate_2d: db.settings.commissionRate2D,
        multiplier_3d: db.settings.multiplier3D,
        commission_rate_3d: db.settings.commissionRate3D,
        announcement: db.settings.announcement,
        service_link_1: db.settings.serviceLink1,
        service_link_2: db.settings.serviceLink2,
        updated_at: new Date().toISOString(),
      });
    } catch (e) {}
  }

  res.json({ success: true, settings: db.settings });
});

// Get bets for a user
app.get('/api/bets', (req, res) => {
  const { userId, type, date } = req.query;
  const db = readDB();

  let list2D = db.bets2D;
  let list3D = db.bets3D;

  if (userId) {
    list2D = list2D.filter((b) => b.userId === userId);
    list3D = list3D.filter((b) => b.userId === userId);
  }

  if (date) {
    list2D = list2D.filter((b) => b.date === date);
    list3D = list3D.filter((b) => b.date === date);
  }

  res.json({
    bets2D: list2D,
    bets3D: list3D,
  });
});

// Cancel a bet (Admin action: refunds net amount to user and marks cancelled)
app.post('/api/bets/cancel', async (req, res) => {
  const { betId, type } = req.body; // type: '2d' | '3d'
  const db = readDB();
  let foundBet: any = null;
  let user: any = null;

  if (type === '3d') {
    foundBet = db.bets3D.find((b) => b.id === betId);
  } else {
    foundBet = db.bets2D.find((b) => b.id === betId);
  }

  if (!foundBet) {
    return res.status(404).json({ success: false, message: 'Bet not found' });
  }

  if (foundBet.status === 'cancelled_by_admin') {
    return res.status(400).json({ success: false, message: 'Bet already cancelled' });
  }

  foundBet.status = 'cancelled_by_admin';
  user = db.users.find((u) => u.id === foundBet.userId);
  if (user) {
    user.balance += foundBet.netAmount;
  }

  writeDB(db);

  if (supabase) {
    try {
      const tableName = type === '3d' ? 'bets_3d' : 'bets_2d';
      await supabase.from(tableName).update({ status: 'cancelled_by_admin' }).eq('id', betId);
      if (user) {
        await supabase.from('users').update({ balance: user.balance }).eq('id', user.id);
        await supabase.from('wallet_transactions').insert({
          id: `tx-cancel-${Date.now()}`,
          user_id: user.id,
          username: user.username,
          type: 'deposit',
          amount: foundBet.netAmount,
          previous_balance: user.balance - foundBet.netAmount,
          new_balance: user.balance,
          remark: `Refund for cancelled ${type.toUpperCase()} Bet (${foundBet.number})`,
          created_by: 'admin',
        });
      }
    } catch (e) {}
  }

  res.json({ success: true, message: 'Bet cancelled and refunded successfully', userBalance: user?.balance });
});

// Get total bets placed per number for live heatmap & limits
app.get('/api/bets/usage', (req, res) => {
  const { date, section, type } = req.query;
  const db = readDB();
  const usage: Record<string, number> = {};

  if (type === '3d') {
    db.bets3D.forEach((b) => {
      const matchDate = !date || b.date === date;
      if (matchDate && b.status !== 'cancelled_by_admin') {
        usage[b.number] = (usage[b.number] || 0) + b.amount;
      }
    });
    return res.json({
      usage,
      limit3D: db.settings.limit3D || 50000,
      customLimits3D: db.settings.customLimits3D || {},
    });
  }

  db.bets2D.forEach((b) => {
    const matchDate = !date || b.date === date;
    const matchSection = !section || b.section === section;
    if (matchDate && matchSection && b.status !== 'cancelled_by_admin') {
      usage[b.number] = (usage[b.number] || 0) + b.amount;
    }
  });

  const customLimits = section === '04:30 PM'
    ? (db.settings.customLimits2D_1630 || {})
    : (db.settings.customLimits2D_1201 || {});

  res.json({
    usage,
    limit2D: db.settings.limit2D || 100000,
    customLimits,
    customLimits2D_1201: db.settings.customLimits2D_1201 || {},
    customLimits2D_1630: db.settings.customLimits2D_1630 || {},
  });
});

// Place 2D bet
app.post('/api/bets/2d', async (req, res) => {
  const { userId, section, bets } = req.body;
  if (!userId || !section || !Array.isArray(bets) || bets.length === 0) {
    return res.status(400).json({ success: false, message: 'Invalid bet submission' });
  }

  const db = readDB();

  // Check server online status
  if (db.settings.serverOnline === false) {
    return res.status(503).json({
      success: false,
      message: db.settings.maintenanceMessage || 'Server under maintenance',
    });
  }

  // Check manual 2D toggle
  if (db.settings.betting2D_enabled === false) {
    return res.status(400).json({ success: false, message: '2D betting is currently CLOSED by Admin' });
  }

  const mmt = getMMTDateTime();
  if (isWeekend(mmt, db.settings.closeDays2D)) {
    return res.status(400).json({ success: false, message: '2D betting is closed today.' });
  }

  const currentMinutes = mmt.getHours() * 60 + mmt.getMinutes();
  if (section === '12:01 PM' && currentMinutes >= (11 * 60 + 50)) {
    return res.status(400).json({ success: false, message: '12:01 Section is CLOSED (Close time: 11:50 AM)' });
  }
  if (section === '04:30 PM' && currentMinutes >= (15 * 60 + 50)) {
    return res.status(400).json({ success: false, message: '4:30 Section is CLOSED (Close time: 03:50 PM)' });
  }

  const user = db.users.find((u) => u.id === userId);
  if (!user) {
    return res.status(404).json({ success: false, message: 'User not found' });
  }

  // Check blocked numbers
  const closedList = section === '12:01 PM'
    ? (db.settings.closedNumbers2D_1201 || [])
    : (db.settings.closedNumbers2D_1630 || []);

  const blockedHits = bets.filter((b) => closedList.includes(b.number));
  if (blockedHits.length > 0) {
    return res.status(400).json({
      success: false,
      message: 'Some numbers are currently closed by Admin',
      blockedNumbers: blockedHits.map((b) => b.number),
    });
  }

  const pad = (n: number) => n.toString().padStart(2, '0');
  const dateStr = `${pad(mmt.getDate())}-${pad(mmt.getMonth() + 1)}-${mmt.getFullYear()}`;
  const timeStr = `${pad(mmt.getHours())}:${pad(mmt.getMinutes())}:${pad(mmt.getSeconds())}`;

  // Check 2D limits per number (including individual custom limits)
  const customLimits = section === '12:01 PM'
    ? (db.settings.customLimits2D_1201 || {})
    : (db.settings.customLimits2D_1630 || {});
  const defaultLimit2D = db.settings.limit2D || 100000;

  // Calculate current usage for each number today in this section
  const currentUsageMap: Record<string, number> = {};
  db.bets2D.forEach((b) => {
    if (b.date === dateStr && b.section === section && b.status !== 'cancelled_by_admin') {
      currentUsageMap[b.number] = (currentUsageMap[b.number] || 0) + b.amount;
    }
  });

  for (const b of bets) {
    const numLimit = customLimits[b.number] !== undefined ? Number(customLimits[b.number]) : defaultLimit2D;
    const current = currentUsageMap[b.number] || 0;
    const betAmt = Number(b.amount) || 0;
    if (current + betAmt > numLimit) {
      const remaining = Math.max(0, numLimit - current);
      return res.status(400).json({
        success: false,
        message: `ဂဏန်း ${b.number} အတွက် Limit (${numLimit.toLocaleString()} MMK) ပြည့်သွားပါပြီ။ လက်ကျန်ထိုးနိုင်ငွေ: ${remaining.toLocaleString()} MMK`,
      });
    }
  }

  const totalAmount = bets.reduce((sum, b) => sum + (Number(b.amount) || 0), 0);
  if (user.balance < totalAmount) {
    return res.status(400).json({
      success: false,
      message: `Insufficient balance. Required: ${totalAmount.toLocaleString()} MMK, Current: ${user.balance.toLocaleString()} MMK`,
    });
  }

  user.balance -= totalAmount;

  const newBets: DBData['bets2D'] = bets.map((b, idx) => ({
    id: `bet2d-${Date.now()}-${idx}`,
    userId: user.id,
    username: user.username,
    date: dateStr,
    time: timeStr,
    section: section as '12:01 PM' | '04:30 PM',
    number: b.number,
    multiplier: db.settings.multiplier2D || 80,
    amount: Number(b.amount),
    status: 'pending',
    winAmount: 0,
    commission: Math.round(Number(b.amount) * (db.settings.commissionRate2D || 0.12)),
    netAmount: 0,
    createdAt: new Date().toISOString(),
  }));

  db.bets2D.unshift(...newBets);
  writeDB(db);

  // Sync to Supabase table
  if (supabase) {
    try {
      await supabase.from('bets_2d').insert(
        newBets.map((b) => ({
          id: b.id,
          user_id: b.userId,
          username: b.username,
          date: b.date,
          time: b.time,
          section: b.section,
          number: b.number,
          multiplier: b.multiplier,
          amount: b.amount,
          status: b.status,
          win_amount: b.winAmount,
          commission: b.commission,
          net_amount: b.netAmount,
          created_at: b.createdAt,
        }))
      );
      await supabase.from('users').update({ balance: user.balance }).eq('id', user.id);
    } catch (e) {
      // Ignored if table not created yet
    }
  }

  res.json({
    success: true,
    message: 'Bet placed successfully',
    newBalance: user.balance,
    placedBets: newBets,
  });
});

// Place 3D bet
app.post('/api/bets/3d', async (req, res) => {
  const { userId, bets } = req.body;
  if (!userId || !Array.isArray(bets) || bets.length === 0) {
    return res.status(400).json({ success: false, message: 'Invalid 3D bet submission' });
  }

  const db = readDB();

  if (db.settings.serverOnline === false) {
    return res.status(503).json({
      success: false,
      message: db.settings.maintenanceMessage || 'Server under maintenance',
    });
  }

  // Check manual 3D toggle
  if (db.settings.betting3D_enabled === false) {
    return res.status(400).json({
      success: false,
      message: '3D betting is currently CLOSED by Admin',
    });
  }

  const user = db.users.find((u) => u.id === userId);
  if (!user) {
    return res.status(404).json({ success: false, message: 'User not found' });
  }

  // Check 3D blocked numbers
  const closed3D = db.settings.closedNumbers3D || [];
  const blockedHits = bets.filter((b) => closed3D.includes(b.number));
  if (blockedHits.length > 0) {
    return res.status(400).json({
      success: false,
      message: 'Some 3D numbers are currently closed by Admin',
      blockedNumbers: blockedHits.map((b) => b.number),
    });
  }

  // Check 3D limits (including individual custom limits)
  const customLimits3D = db.settings.customLimits3D || {};
  const defaultLimit3D = db.settings.limit3D || 50000;

  const currentUsage3D: Record<string, number> = {};
  db.bets3D.forEach((b) => {
    if (b.date === dateStr && b.status !== 'cancelled_by_admin') {
      currentUsage3D[b.number] = (currentUsage3D[b.number] || 0) + b.amount;
    }
  });

  for (const b of bets) {
    const numLimit = customLimits3D[b.number] !== undefined ? Number(customLimits3D[b.number]) : defaultLimit3D;
    const current = currentUsage3D[b.number] || 0;
    const betAmt = Number(b.amount) || 0;
    if (current + betAmt > numLimit) {
      const remaining = Math.max(0, numLimit - current);
      return res.status(400).json({
        success: false,
        message: `3D ဂဏန်း ${b.number} အတွက် Limit (${numLimit.toLocaleString()} MMK) ပြည့်သွားပါပြီ။ လက်ကျန်: ${remaining.toLocaleString()} MMK`,
      });
    }
  }

  const totalAmount = bets.reduce((sum, b) => sum + (Number(b.amount) || 0), 0);
  if (user.balance < totalAmount) {
    return res.status(400).json({
      success: false,
      message: `Insufficient balance. Required: ${totalAmount.toLocaleString()} MMK`,
    });
  }

  user.balance -= totalAmount;

  const mmt = getMMTDateTime();
  const pad = (n: number) => n.toString().padStart(2, '0');
  const dateStr = `${pad(mmt.getDate())}-${pad(mmt.getMonth() + 1)}-${mmt.getFullYear()}`;
  const timeStr = `${pad(mmt.getHours())}:${pad(mmt.getMinutes())}:${pad(mmt.getSeconds())}`;

  const newBets: DBData['bets3D'] = bets.map((b, idx) => ({
    id: `bet3d-${Date.now()}-${idx}`,
    userId: user.id,
    username: user.username,
    date: dateStr,
    time: timeStr,
    number: b.number,
    multiplier: db.settings.multiplier3D || 500,
    amount: Number(b.amount),
    status: 'pending',
    winAmount: 0,
    commission: Math.round(Number(b.amount) * (db.settings.commissionRate3D || 0.10)),
    netAmount: 0,
    createdAt: new Date().toISOString(),
  }));

  db.bets3D.unshift(...newBets);
  writeDB(db);

  // Sync to Supabase table
  if (supabase) {
    try {
      await supabase.from('bets_3d').insert(
        newBets.map((b) => ({
          id: b.id,
          user_id: b.userId,
          username: b.username,
          date: b.date,
          time: b.time,
          number: b.number,
          multiplier: b.multiplier,
          amount: b.amount,
          status: b.status,
          win_amount: b.winAmount,
          commission: b.commission,
          net_amount: b.netAmount,
          created_at: b.createdAt,
        }))
      );
      await supabase.from('users').update({ balance: user.balance }).eq('id', user.id);
    } catch (e) {
      // Ignored if table not created yet
    }
  }

  res.json({
    success: true,
    message: '3D Bet placed successfully',
    newBalance: user.balance,
    placedBets: newBets,
  });
});

// Settle 3D bets (supports Direct 500x, Toot 10x, Adjacent 10x)
const handleSettle3DAction = async (req: express.Request, res: express.Response) => {
  const date = req.body.date;
  const rawResult = req.body.resultNumber || req.body.winningNumber;
  if (!date || !rawResult || rawResult.trim().length !== 3) {
    return res.status(400).json({ success: false, message: 'Valid date and 3-digit result required (e.g. date: 16-09-2026, result: 456)' });
  }

  const resultNumber = rawResult.trim();
  const db = readDB();
  if (!db.settings.official3DResults) {
    db.settings.official3DResults = {};
  }
  db.settings.official3DResults[date] = resultNumber;
  db.settings.manual3DResult = resultNumber;

  const multDirect = db.settings.multiplier3D || 500;
  const multToot = db.settings.multiplier3D_toot || 10;
  const multAdjacent = db.settings.multiplier3D_chai || 10;

  let settledCount = 0;
  let winnersCount = 0;
  let totalWinPayout = 0;

  db.bets3D.forEach((bet) => {
    if (bet.date === date && bet.status === 'pending') {
      bet.resultNumber = resultNumber;
      const winCheck = calculate3DWinServer(bet.number, resultNumber, multDirect, multToot, multAdjacent);

      if (winCheck.isWin) {
        bet.status = 'win';
        (bet as any).winType = winCheck.winType;
        (bet as any).winLabel = winCheck.label;
        bet.multiplier = winCheck.multiplier;
        bet.winAmount = bet.amount * winCheck.multiplier;
        bet.netAmount = bet.winAmount + bet.commission - bet.amount;

        const user = db.users.find((u) => u.id === bet.userId);
        if (user) {
          user.balance += (bet.winAmount + bet.commission);
        }
        winnersCount++;
        totalWinPayout += bet.winAmount;
      } else {
        bet.status = 'lose';
        (bet as any).winType = undefined;
        (bet as any).winLabel = undefined;
        bet.winAmount = 0;
        bet.netAmount = bet.commission - bet.amount;

        const user = db.users.find((u) => u.id === bet.userId);
        if (user) {
          user.balance += bet.commission;
        }
      }
      settledCount++;
    }
  });

  writeDB(db);

  if (supabase) {
    try {
      await supabase.from('app_settings').upsert({
        id: 'current',
        manual_3d_result: resultNumber,
        official_3d_results: db.settings.official3DResults,
        updated_at: new Date().toISOString(),
      });
    } catch (e) {}
  }

  res.json({
    success: true,
    settledCount,
    winnersCount,
    totalWinPayout,
    resultNumber,
    date,
    message: `3D draw settled for ${date}! Winning result: ${resultNumber} (Winners: ${winnersCount}, Payout: ${totalWinPayout.toLocaleString()} MMK)`,
  });
};

app.post('/api/admin/settle-3d', handleSettle3DAction);
app.post('/api/bets/3d/settle', handleSettle3DAction);

// Settle 2D bets manually
const handleSettle2DAction = (req: express.Request, res: express.Response) => {
  const { date, section, resultNumber } = req.body;
  if (!date || !section || !resultNumber || resultNumber.trim().length !== 2) {
    return res.status(400).json({ success: false, message: 'Missing or invalid 2-digit result' });
  }
  const cleanResult = resultNumber.trim();
  const winnersCount = settle2DBets(date, section, cleanResult);
  res.json({ success: true, winnersCount, message: `2D ${section} settled with result: ${cleanResult}` });
};

app.post('/api/admin/settle-2d', handleSettle2DAction);
app.post('/api/bets/2d/settle', handleSettle2DAction);

// Aggregated Ledger endpoint
app.get('/api/ledger', (req, res) => {
  const { userId } = req.query;
  const db = readDB();

  const userBets2D = userId ? db.bets2D.filter((b) => b.userId === userId) : db.bets2D;
  const userBets3D = userId ? db.bets3D.filter((b) => b.userId === userId) : db.bets3D;

  const ledger2DMap: Record<string, any> = {};
  userBets2D.forEach((bet) => {
    if (!ledger2DMap[bet.date]) {
      ledger2DMap[bet.date] = {
        date: bet.date,
        totalBet: 0,
        winLose: 0,
        commission: 0,
        netTotal: 0,
        bets: [],
      };
    }
    const row = ledger2DMap[bet.date];
    row.totalBet += bet.amount;
    if (bet.status === 'win') {
      row.winLose += (bet.winAmount - bet.amount);
    } else if (bet.status === 'lose') {
      row.winLose -= bet.amount;
    }
    row.commission += bet.commission;
    row.netTotal = row.winLose + row.commission;
    row.bets.push(bet);
  });

  const ledger3DMap: Record<string, any> = {};
  userBets3D.forEach((bet) => {
    if (!ledger3DMap[bet.date]) {
      ledger3DMap[bet.date] = {
        date: bet.date,
        totalBet: 0,
        winLose: 0,
        commission: 0,
        netTotal: 0,
        bets: [],
      };
    }
    const row = ledger3DMap[bet.date];
    row.totalBet += bet.amount;
    if (bet.status === 'win') {
      row.winLose += (bet.winAmount - bet.amount);
    } else if (bet.status === 'lose') {
      row.winLose -= bet.amount;
    }
    row.commission += bet.commission;
    row.netTotal = row.winLose + row.commission;
    row.bets.push(bet);
  });

  // Combined 2D + 3D Ledger (All in one ledger per Date)
  const ledgerAllMap: Record<string, any> = {};
  [...userBets2D, ...userBets3D].forEach((bet) => {
    if (!ledgerAllMap[bet.date]) {
      ledgerAllMap[bet.date] = {
        date: bet.date,
        totalBet: 0,
        winLose: 0,
        commission: 0,
        netTotal: 0,
        bets2DCount: 0,
        bets3DCount: 0,
        bets: [],
      };
    }
    const row = ledgerAllMap[bet.date];
    row.totalBet += bet.amount;
    if (bet.status === 'win') {
      row.winLose += (bet.winAmount - bet.amount);
    } else if (bet.status === 'lose') {
      row.winLose -= bet.amount;
    }
    row.commission += bet.commission;
    row.netTotal = row.winLose + row.commission;
    if ('section' in bet) {
      row.bets2DCount = (row.bets2DCount || 0) + 1;
    } else {
      row.bets3DCount = (row.bets3DCount || 0) + 1;
    }
    row.bets.push(bet);
  });

  res.json({
    ledgerAll: Object.values(ledgerAllMap).sort((a, b) => b.date.localeCompare(a.date)),
    ledger2D: Object.values(ledger2DMap).sort((a, b) => b.date.localeCompare(a.date)),
    ledger3D: Object.values(ledger3DMap).sort((a, b) => b.date.localeCompare(a.date)),
    supabaseConnected: Boolean(supabase),
  });
});

async function startServer() {
  const isProd = process.env.NODE_ENV === 'production';

  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.join(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`NM 2D Server running on http://localhost:${PORT}`);
  });
}

startServer();
