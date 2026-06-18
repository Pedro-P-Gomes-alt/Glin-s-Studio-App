/**
 * Seed script — clears all user data and inserts a full year of realistic
 * demo data for Glin's Studio (cosplay + sports suits solo maker).
 *
 * Run with: node scripts/seed.cjs
 */
const Database = require("better-sqlite3");
const path = require("path");
const os   = require("os");

const DB_PATH = path.join(
  os.homedir(),
  "AppData", "Roaming", "com.glins.studio", "glins_studio.db"
);

const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = OFF");

// ─── 1. CLEAR ALL USER DATA ────────────────────────────────────────────────
console.log("Clearing existing data…");
db.exec(`
  DELETE FROM social_snapshots;
  DELETE FROM ig_media;
  DELETE FROM yt_videos;
  DELETE FROM payments;
  DELETE FROM time_logs;
  DELETE FROM events;
  DELETE FROM projects;
  DELETE FROM clients;
  DELETE FROM quotes;
  DELETE FROM categories;
`);

// ─── 2. CATEGORIES ─────────────────────────────────────────────────────────
// Columns: id, category, subtype
console.log("Inserting categories…");
db.exec(`
  INSERT INTO categories (id, category, subtype) VALUES
    (1, 'cosplay', 'Dress'),
    (2, 'cosplay', 'Full Costume'),
    (3, 'cosplay', 'Wig'),
    (4, 'cosplay', 'Prop'),
    (5, 'sports',  'Roller Dress'),
    (6, 'sports',  'Artistic Dress'),
    (7, 'sports',  'Accessories');
`);

// ─── 3. CLIENTS ────────────────────────────────────────────────────────────
// Columns: id, name, contact_handle, notes, first_seen_date, pronouns
console.log("Inserting clients…");
db.exec(`
  INSERT INTO clients (id, name, contact_handle, notes, first_seen_date) VALUES
    (1,  'Sara Costa',         '@sara.cosplay',     'Repeat client. Loves detailed embroidery. Always pays on time.',       '2024-01-08'),
    (2,  'Mariana Figueiredo', '@mari.figueiredo',  'First-time client. Very clear on references.',                         '2024-01-20'),
    (3,  'Ana Rodrigues',      '@ana_skates',       'Roller skater. Orders a new dress every season.',                      '2024-02-03'),
    (4,  'Joao Oliveira',      'joao.oli@gmail.com','Prop commissions only. Always has complex laser-cut parts.',           '2024-02-14'),
    (5,  'Beatriz Santos',     '@bea.on.wheels',    'Artistic roller skater. Frequent client, trusts Glin completely.',     '2024-03-01'),
    (6,  'Catarina Mendes',    '@cat_cosplays',     'Started with a wig, now orders full costumes.',                        '2024-03-15'),
    (7,  'Laura Ferreira',     '@lauraferr',        'Contest client — tight deadlines, good budgets.',                      '2024-04-05'),
    (8,  'Ines Carvalho',      '@ines_artistic',    'Sports artistic dancer. Very specific about fabric and rhinestones.',  '2024-05-10'),
    (9,  'Rita Sousa',         '@rita.cos',         'Repeat cosplay client, orders once or twice a year.',                  '2024-07-02'),
    (10, 'Marta Lopes',        '@marta_roll',       'New client. Roller competition in December.',                          '2024-09-14');
`);

// ─── 4. PROJECTS ───────────────────────────────────────────────────────────
// Columns: id, client_id, category_id, title, planned_start, planned_end,
//          image_path, material_cost_cents, sale_price_cents, status_override,
//          created_at, shipped, delivered, shipped_at, project_type, personal_category
console.log("Inserting projects…");
db.exec(`
  INSERT INTO projects
    (id, client_id, category_id, title,
     planned_start, planned_end,
     material_cost_cents, sale_price_cents,
     shipped, delivered, shipped_at,
     project_type, personal_category, created_at)
  VALUES
  (1,  1,1,'Sakura Dress — Sara',          '2024-01-08','2024-01-28', 6200,42000,1,1,'2024-01-29','commission',NULL,'2024-01-08'),
  (2,  2,3,'Violet Wig — Mariana',         '2024-01-20','2024-02-05', 1800, 9500,1,1,'2024-02-06','commission',NULL,'2024-01-20'),
  (3,  3,5,'Spring Roller Dress — Ana',    '2024-02-03','2024-02-25', 5500,32000,1,1,'2024-02-26','commission',NULL,'2024-02-03'),
  (4,  4,4,'Sword Prop — Joao',            '2024-02-14','2024-03-10', 3200,18500,1,1,'2024-03-11','commission',NULL,'2024-02-14'),
  (5,  5,5,'Summer Roller Dress — Beatriz','2024-03-01','2024-03-22', 4800,28000,1,1,'2024-03-23','commission',NULL,'2024-03-01'),
  (6,  6,3,'Silver Wig — Catarina',        '2024-03-15','2024-04-01', 2100,11500,1,1,'2024-04-02','commission',NULL,'2024-03-15'),
  (7,  1,1,'Fantasy Gown — Sara',          '2024-03-20','2024-04-15', 7800,52000,1,1,'2024-04-16','commission',NULL,'2024-03-20'),
  (8,  7,2,'Full Knight Costume — Laura',  '2024-04-05','2024-05-05', 9500,68000,1,1,'2024-05-06','commission',NULL,'2024-04-05'),
  (9,  3,5,'Autumn Roller Dress — Ana',    '2024-04-10','2024-04-30', 5200,31000,1,1,'2024-05-01','commission',NULL,'2024-04-10'),
  (10, 8,6,'Artistic Competition Dress — Ines','2024-05-10','2024-06-05',7100,44000,1,1,'2024-06-06','commission',NULL,'2024-05-10'),
  (11, 5,5,'Competition Dress — Beatriz',  '2024-05-15','2024-06-10', 6300,38000,1,1,'2024-06-11','commission',NULL,'2024-05-15'),
  (12, 4,4,'Shield Prop — Joao',           '2024-06-01','2024-06-25', 2800,16000,1,1,'2024-06-26','commission',NULL,'2024-06-01'),
  (13, 6,2,'Mage Full Costume — Catarina', '2024-06-05','2024-07-10',11200,75000,1,1,'2024-07-11','commission',NULL,'2024-06-05'),
  (14, 9,1,'Galaxy Dress — Rita',          '2024-07-02','2024-07-28', 6600,43000,1,1,'2024-07-29','commission',NULL,'2024-07-02'),
  (15, 1,3,'Curly Pink Wig — Sara',        '2024-07-10','2024-07-25', 1900,10500,1,1,'2024-07-26','commission',NULL,'2024-07-10'),
  (16, 5,5,'Winter Roller Dress — Beatriz','2024-08-05','2024-08-28', 5100,30500,1,1,'2024-08-29','commission',NULL,'2024-08-05'),
  (17, 7,4,'Spear Prop — Laura',           '2024-08-12','2024-09-02', 2600,14000,1,1,'2024-09-03','commission',NULL,'2024-08-12'),
  (18, 8,6,'Autumn Artistic Dress — Ines', '2024-09-01','2024-09-25', 6800,41000,1,1,'2024-09-26','commission',NULL,'2024-09-01'),
  (19,10,5,'Debut Roller Dress — Marta',   '2024-09-14','2024-10-10', 5400,33000,1,1,'2024-10-11','commission',NULL,'2024-09-14'),
  (20, 2,2,'Elf Full Costume — Mariana',   '2024-10-01','2024-11-05',10800,72000,1,1,'2024-11-06','commission',NULL,'2024-10-01'),
  (21, 3,5,'Winter Roller Dress — Ana',    '2024-10-08','2024-10-30', 5300,32000,1,1,'2024-10-31','commission',NULL,'2024-10-08'),
  (22, 9,1,'Winter Ball Gown — Rita',      '2024-11-01','2024-11-28', 7200,47000,1,1,'2024-11-29','commission',NULL,'2024-11-01'),
  (23, 6,3,'Golden Wig — Catarina',        '2024-11-05','2024-11-22', 2000,11000,1,1,'2024-11-23','commission',NULL,'2024-11-05'),
  (24, 5,7,'Sequin Accessories Set — Beatriz','2024-11-10','2024-11-30',1800,8500,1,1,'2024-11-30','commission',NULL,'2024-11-10'),
  (25,10,5,'Competition Dress — Marta',    '2024-11-20','2024-12-15', 6200,39000,1,1,'2024-12-16','commission',NULL,'2024-11-20'),
  (26, 7,2,'Dark Elf Costume — Laura',     '2024-12-01','2025-01-15',12000,82000,1,1,'2025-01-16','commission',NULL,'2024-12-01'),
  (27, 1,1,'Cherry Blossom Dress — Sara',  '2025-01-06','2025-01-28', 6800,46000,1,1,'2025-01-29','commission',NULL,'2025-01-06'),
  (28, 4,4,'Axe Prop — Joao',              '2025-01-15','2025-02-05', 3100,17500,1,1,'2025-02-06','commission',NULL,'2025-01-15'),
  (29, 8,6,'Spring Artistic Dress — Ines', '2025-02-03','2025-02-28', 7000,43000,1,1,'2025-02-28','commission',NULL,'2025-02-03'),
  (30, 5,5,'Spring Roller Dress — Beatriz','2025-02-10','2025-03-05', 5600,34000,1,1,'2025-03-06','commission',NULL,'2025-02-10'),
  (31, 3,5,'Spring Roller Dress — Ana',    '2025-03-01','2025-03-24', 5100,31500,1,1,'2025-03-25','commission',NULL,'2025-03-01'),
  (32, 9,1,'Spring Cosplay Dress — Rita',  '2025-03-10','2025-04-02', 6400,41500,1,1,'2025-04-03','commission',NULL,'2025-03-10'),
  (33, 2,3,'Teal Wig — Mariana',           '2025-04-01','2025-04-18', 1900,10500,1,1,'2025-04-19','commission',NULL,'2025-04-01'),
  (34, 6,2,'Warrior Costume — Catarina',   '2025-04-05','2025-05-10',10500,71000,1,1,'2025-05-11','commission',NULL,'2025-04-05'),
  (35,10,5,'Summer Roller Dress — Marta',  '2025-05-01','2025-05-26', 5400,33500,1,1,'2025-05-27','commission',NULL,'2025-05-01'),
  (36, 7,1,'Celestial Dress — Laura',      '2025-05-08','2025-06-03', 7600,49000,1,1,'2025-06-04','commission',NULL,'2025-05-08'),
  (37, 1,1,'Moonlit Gown — Sara',          '2025-06-02','2025-06-30', 6900,45000,1,1,'2025-06-14','commission',NULL,'2025-06-02'),
  (38, 5,7,'Crystal Accessories — Beatriz','2025-06-05','2025-06-25', 1600, 8000,0,0,NULL,         'commission',NULL,'2025-06-05'),
  (39, 8,6,'Summer Artistic Dress — Ines', '2025-06-10','2025-07-05', 7300,45500,0,0,NULL,         'commission',NULL,'2025-06-10'),
  (40, 4,4,'Dragon Head Prop — Joao',      '2025-07-01','2025-07-25', 4500,26000,0,0,NULL,         'commission',NULL,'2025-06-12'),
  (41, 3,5,'Autumn Roller Dress — Ana',    '2025-07-10','2025-08-05', 5300,32500,0,0,NULL,         'commission',NULL,'2025-06-15'),
  (42,NULL,NULL,'YouTube — April Making-of Video',        '2025-04-15','2025-04-20', 0,NULL,0,0,NULL,'personal','video',      '2025-04-15'),
  (43,NULL,NULL,'Animanga Lisboa Prep — Competition Entry','2025-04-20','2025-05-18',12000,NULL,0,0,NULL,'personal','competition','2025-04-20'),
  (44,NULL,NULL,'Short-form — Speed Sewing Reel',         '2025-05-05','2025-05-07', 0,NULL,0,0,NULL,'personal','short',      '2025-05-05'),
  (45,NULL,NULL,'YouTube — Wig Styling Tutorial',         '2025-05-20','2025-05-26', 800,NULL,0,0,NULL,'personal','video',    '2025-05-20'),
  (46,NULL,NULL,'Short-form — Material Haul Reel',        '2025-06-01','2025-06-03', 0,NULL,0,0,NULL,'personal','short',     '2025-06-01'),
  (47,NULL,NULL,'YouTube — Full Build Timelapse',         '2025-06-08','2025-06-18', 0,NULL,0,0,NULL,'personal','video',     '2025-06-08');
`);

// ─── 5. PAYMENTS ───────────────────────────────────────────────────────────
console.log("Inserting payments…");
const paymentData = [
  [1,21000,'2024-01-08','advance'],[1,21000,'2024-01-29','final'],
  [2, 4750,'2024-01-20','advance'],[2, 4750,'2024-02-06','final'],
  [3,16000,'2024-02-03','advance'],[3,16000,'2024-02-26','final'],
  [4, 9250,'2024-02-14','advance'],[4, 9250,'2024-03-11','final'],
  [5,14000,'2024-03-01','advance'],[5,14000,'2024-03-23','final'],
  [6, 5750,'2024-03-15','advance'],[6, 5750,'2024-04-02','final'],
  [7,26000,'2024-03-20','advance'],[7,26000,'2024-04-16','final'],
  [8,34000,'2024-04-05','advance'],[8,34000,'2024-05-06','final'],
  [9,15500,'2024-04-10','advance'],[9,15500,'2024-05-01','final'],
  [10,22000,'2024-05-10','advance'],[10,22000,'2024-06-06','final'],
  [11,19000,'2024-05-15','advance'],[11,19000,'2024-06-11','final'],
  [12, 8000,'2024-06-01','advance'],[12, 8000,'2024-06-26','final'],
  [13,37500,'2024-06-05','advance'],[13,37500,'2024-07-11','final'],
  [14,21500,'2024-07-02','advance'],[14,21500,'2024-07-29','final'],
  [15, 5250,'2024-07-10','advance'],[15, 5250,'2024-07-26','final'],
  [16,15250,'2024-08-05','advance'],[16,15250,'2024-08-29','final'],
  [17, 7000,'2024-08-12','advance'],[17, 7000,'2024-09-03','final'],
  [18,20500,'2024-09-01','advance'],[18,20500,'2024-09-26','final'],
  [19,16500,'2024-09-14','advance'],[19,16500,'2024-10-11','final'],
  [20,36000,'2024-10-01','advance'],[20,36000,'2024-11-06','final'],
  [21,16000,'2024-10-08','advance'],[21,16000,'2024-10-31','final'],
  [22,23500,'2024-11-01','advance'],[22,23500,'2024-11-29','final'],
  [23, 5500,'2024-11-05','advance'],[23, 5500,'2024-11-23','final'],
  [24, 4250,'2024-11-10','advance'],[24, 4250,'2024-11-30','final'],
  [25,19500,'2024-11-20','advance'],[25,19500,'2024-12-16','final'],
  [26,41000,'2024-12-01','advance'],[26,41000,'2025-01-16','final'],
  [27,23000,'2025-01-06','advance'],[27,23000,'2025-01-29','final'],
  [28, 8750,'2025-01-15','advance'],[28, 8750,'2025-02-06','final'],
  [29,21500,'2025-02-03','advance'],[29,21500,'2025-02-28','final'],
  [30,17000,'2025-02-10','advance'],[30,17000,'2025-03-06','final'],
  [31,15750,'2025-03-01','advance'],[31,15750,'2025-03-25','final'],
  [32,20750,'2025-03-10','advance'],[32,20750,'2025-04-03','final'],
  [33, 5250,'2025-04-01','advance'],[33, 5250,'2025-04-19','final'],
  [34,35500,'2025-04-05','advance'],[34,35500,'2025-05-11','final'],
  [35,16750,'2025-05-01','advance'],[35,16750,'2025-05-27','final'],
  [36,24500,'2025-05-08','advance'],[36,24500,'2025-06-04','final'],
  [37,22500,'2025-06-02','advance'],[37,22500,'2025-06-14','final'],
  [38, 4000,'2025-06-05','advance'],
  [39,22750,'2025-06-10','advance'],
];
const insPayment = db.prepare(
  `INSERT INTO payments (project_id, amount_cents, received_on, label) VALUES (?, ?, ?, ?)`
);
db.transaction(() => { for (const r of paymentData) insPayment.run(...r); })();

// ─── 6. TIME LOGS ──────────────────────────────────────────────────────────
console.log("Inserting time logs…");

function workdays(startStr, endStr) {
  const days = [];
  const cur = new Date(startStr + "T00:00:00");
  const end = new Date(endStr   + "T00:00:00");
  while (cur <= end) {
    const dow = cur.getDay();
    if (dow !== 0 && dow !== 6) days.push(cur.toISOString().split("T")[0]);
    cur.setDate(cur.getDate() + 1);
  }
  return days;
}

const rand = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const pick  = (arr) => arr[Math.floor(Math.random() * arr.length)];

const cosplayDescs = [
  "Cutting and sewing main bodice","Working on skirt panels and ruffles",
  "Hand-embroidery details","Fitting and adjustments","Lining and finishing seams",
  "Attaching boning and structure","Zipper and closure work","Decorative elements — gems and trims",
  "Final pressing and quality check","Pattern drafting and mock-up","Bead and sequin work",
];
const sportsDescs = [
  "Cutting lycra panels","Sewing competition panels","Rhinestone application",
  "Bias tape and edges","Mock-up fitting adjustments","Hand-stitching decorative stones",
  "Adding mesh layers","Finishing straps and neckline","Pressing and inspection",
];
const wigDescs = [
  "Wefting and ventilating","Cutting and shaping wig","Heat styling curls/waves",
  "Dyeing and blending","Final styling and product application",
];
const propDescs = [
  "Foam cutting and shaping","Sanding and priming layers","Painting base coat",
  "Detail painting and weathering","Worbla forming and heat shaping","Assembling components","Sealing and finishing",
];
const adminDescs = [
  "Client communication and revisions","Sourcing materials and suppliers",
  "Photographing finished work","Updating social media","Pattern organization","Studio maintenance",
];
const personalDescs = {
  video:       ["Filming making-of footage","Editing YouTube video","Recording narration","Colour grading and music"],
  short:       ["Filming speed-sewing reel","Editing short-form content","Caption writing and scheduling"],
  competition: ["Working on competition entry","Embellishing contest piece","Finalising competition details"],
};

function descForCat(catId) {
  if (catId === 1 || catId === 2) return pick(cosplayDescs);
  if (catId === 3) return pick(wigDescs);
  if (catId === 4) return pick(propDescs);
  return pick(sportsDescs);
}

const projectMeta = {
  1:1,2:3,3:5,4:4,5:5,6:3,7:1,8:2,9:5,10:6,
  11:5,12:4,13:2,14:1,15:3,16:5,17:4,18:6,19:5,
  20:2,21:5,22:1,23:3,24:7,25:5,26:2,27:1,28:4,
  29:6,30:5,31:5,32:1,33:3,34:2,35:5,36:1,37:1,
  38:7,39:6,40:4,41:5,
};
const personalMeta = {42:'video',43:'competition',44:'short',45:'video',46:'short',47:'video'};

const projectRanges = [
  [1,'2024-01-08','2024-01-28'],[2,'2024-01-20','2024-02-05'],
  [3,'2024-02-03','2024-02-25'],[4,'2024-02-14','2024-03-10'],
  [5,'2024-03-01','2024-03-22'],[6,'2024-03-15','2024-04-01'],
  [7,'2024-03-20','2024-04-15'],[8,'2024-04-05','2024-05-05'],
  [9,'2024-04-10','2024-04-30'],[10,'2024-05-10','2024-06-05'],
  [11,'2024-05-15','2024-06-10'],[12,'2024-06-01','2024-06-25'],
  [13,'2024-06-05','2024-07-10'],[14,'2024-07-02','2024-07-28'],
  [15,'2024-07-10','2024-07-25'],[16,'2024-08-05','2024-08-28'],
  [17,'2024-08-12','2024-09-02'],[18,'2024-09-01','2024-09-25'],
  [19,'2024-09-14','2024-10-10'],[20,'2024-10-01','2024-11-05'],
  [21,'2024-10-08','2024-10-30'],[22,'2024-11-01','2024-11-28'],
  [23,'2024-11-05','2024-11-22'],[24,'2024-11-10','2024-11-30'],
  [25,'2024-11-20','2024-12-15'],[26,'2024-12-01','2025-01-15'],
  [27,'2025-01-06','2025-01-28'],[28,'2025-01-15','2025-02-05'],
  [29,'2025-02-03','2025-02-28'],[30,'2025-02-10','2025-03-05'],
  [31,'2025-03-01','2025-03-24'],[32,'2025-03-10','2025-04-02'],
  [33,'2025-04-01','2025-04-18'],[34,'2025-04-05','2025-05-10'],
  [35,'2025-05-01','2025-05-26'],[36,'2025-05-08','2025-06-03'],
  [37,'2025-06-02','2025-06-14'],[38,'2025-06-05','2025-06-18'],
  [39,'2025-06-10','2025-06-18'],
  [42,'2025-04-15','2025-04-20'],[43,'2025-04-20','2025-05-18'],
  [44,'2025-05-05','2025-05-07'],[45,'2025-05-20','2025-05-26'],
  [46,'2025-06-01','2025-06-03'],[47,'2025-06-08','2025-06-18'],
];

const insLog = db.prepare(
  `INSERT INTO time_logs (project_id, date, hours, description) VALUES (?, ?, ?, ?)`
);
const loggedDays = new Set();

db.transaction(() => {
  for (const [pid, start, end] of projectRanges) {
    const days  = workdays(start, end);
    const pCat  = personalMeta[pid];
    const catId = projectMeta[pid];
    for (const day of days) {
      if (Math.random() < 0.82) {
        let h, desc;
        if (pCat) {
          h    = pCat === "competition" ? rand(3,7) : rand(2,5);
          desc = pick(personalDescs[pCat] || adminDescs);
        } else {
          h    = (catId===3||catId===7) ? rand(2,4) : catId===4 ? rand(3,7) : rand(4,8);
          desc = descForCat(catId);
        }
        insLog.run(pid, day, h, desc);
        loggedDays.add(day);
      }
    }
  }
  // Unbilled admin days
  for (const day of workdays("2024-01-08","2025-06-17")) {
    if (!loggedDays.has(day) && Math.random() < 0.28) {
      insLog.run(null, day, rand(1,3), pick(adminDescs));
      loggedDays.add(day);
    }
  }
})();

// ─── 7. EVENTS ─────────────────────────────────────────────────────────────
// Columns: id, title, event_type, start_date, end_date, image_path, notes
console.log("Inserting events…");
db.exec(`
  INSERT INTO events (title, event_type, start_date, end_date) VALUES
    ('Summer Holiday',        'vacation',   '2024-07-29','2024-08-04'),
    ('Animanga Lisboa 2024',  'convention', '2024-10-05','2024-10-06'),
    ('Christmas Break',       'vacation',   '2024-12-24','2025-01-05'),
    ('Iberanime Porto 2025',  'convention', '2025-02-22','2025-02-23'),
    ('Roller Skating Contest','contest',    '2025-04-28','2025-04-28'),
    ('Animanga Lisboa 2025',  'convention', '2025-05-17','2025-05-18');
`);

// ─── 8. SOCIAL SNAPSHOTS ────────────────────────────────────────────────────
console.log("Inserting social snapshots…");
function dateStr(daysAgo) {
  const d = new Date("2025-06-18T00:00:00");
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString().split("T")[0];
}
const snapStmt = db.prepare(
  `INSERT OR IGNORE INTO social_snapshots (platform, metric, value, recorded_on) VALUES (?, ?, ?, ?)`
);
db.transaction(() => {
  let ys=1240, yv=284000, ig=3810, tt=2100;
  for (let i=30; i>=0; i--) {
    ys += rand(5,12); yv += rand(200,600); ig += rand(8,18); tt += rand(7,15);
    snapStmt.run("youtube",   "subscribers", ys, dateStr(i));
    snapStmt.run("youtube",   "views",       yv, dateStr(i));
    snapStmt.run("instagram", "followers",   ig, dateStr(i));
    snapStmt.run("tiktok",    "followers",   tt, dateStr(i));
  }
})();

// ─── 9. YOUTUBE VIDEOS ─────────────────────────────────────────────────────
console.log("Inserting YouTube videos…");
db.exec(`
  INSERT INTO yt_videos (video_id, title, published_at, view_count, like_count, comment_count) VALUES
    ('ytv001','Full Cosplay Dress Build - From Zero to Finished!','2025-05-28T10:00:00Z',4820,312,47),
    ('ytv002','Wig Styling Tutorial - Curly Fantasy Look',        '2025-05-10T10:00:00Z',2940,189,28),
    ('ytv003','How I Sew Competition Roller Skating Dresses',     '2025-04-22T10:00:00Z',6110,420,63),
    ('ytv004','My Sewing Room Tour + Setup 2025',                 '2025-03-30T10:00:00Z',8340,670,91),
    ('ytv005','Cosplay Material Haul - What I Bought This Month', '2025-03-01T10:00:00Z',3250,204,31),
    ('ytv006','Prop Making 101 - Foam Sword Start to Finish',     '2025-02-10T10:00:00Z',5780,390,55),
    ('ytv007','Speed Sewing a Dress in 24 Hours',                 '2025-01-18T10:00:00Z',9420,810,104),
    ('ytv008','2024 Year in Review - All My Projects',            '2024-12-28T10:00:00Z',11200,930,138);
`);

// ─── 10. INSTAGRAM MEDIA ────────────────────────────────────────────────────
console.log("Inserting Instagram media…");
db.exec(`
  INSERT INTO ig_media (media_id, media_type, caption, timestamp, like_count, comments_count) VALUES
    ('ig001','IMAGE','Just finished this moonlit gown - so happy with how the hand-embroidery came out! #cosplay #sewing #handmade','2025-06-14T12:00:00Z',624,38),
    ('ig002','VIDEO','Speed sewing a rhinestone roller dress. Full process in 60 seconds! #rollerdress #skating','2025-06-08T18:00:00Z',891,52),
    ('ig003','IMAGE','Crystal accessories set for @bea.on.wheels — in progress #accessories #handmade','2025-06-05T14:00:00Z',412,22),
    ('ig004','IMAGE','Celestial cosplay dress — delivered! This took 3.5 weeks and every hour was worth it','2025-06-04T10:00:00Z',780,45),
    ('ig005','VIDEO','Pattern drafting time-lapse #sewingprocess #patternmaking','2025-05-27T16:00:00Z',543,30),
    ('ig006','IMAGE','Spring roller dress out the door, competition season is here! #rollerdress #skating','2025-05-27T09:00:00Z',698,41),
    ('ig007','IMAGE','New material haul - so many good finds this month #fabrichaul','2025-05-20T14:00:00Z',360,18),
    ('ig008','IMAGE','My workspace right now — organised chaos #sewingstudio','2025-05-12T11:00:00Z',445,27),
    ('ig009','VIDEO','How I ventilate a wig — step by step #wigmaking #tutorial','2025-05-10T17:00:00Z',612,35),
    ('ig010','IMAGE','Spring cosplay dress completed! Client was so happy #cosplay #sewingblogger','2025-04-19T12:00:00Z',720,44),
    ('ig011','IMAGE','Competition entry almost ready for Animanga Lisboa! #cosplaycompetition','2025-04-15T10:00:00Z',834,58),
    ('ig012','IMAGE','Teal wig looking absolutely stunning if I do say so myself #wigmaker','2025-04-03T15:00:00Z',509,29);
`);

// ─── 11. QUOTES ─────────────────────────────────────────────────────────────
// Columns: source_id, submitted_at, data (JSON), seen, status
console.log("Inserting quotes…");
const insQuote = db.prepare(
  `INSERT INTO quotes (source_id, submitted_at, data, seen, status) VALUES (?, ?, ?, 0, 'pending')`
);
db.transaction(() => {
  insQuote.run("FORM-2025-001","2025-06-16T09:14:00Z",
    JSON.stringify({name:"Francisca Alves",email:"francisca@example.com",project_type:"Cosplay Dress",description:"Looking for a full Elsa (Frozen) dress, movie accurate. Attending Iberanime in October."}));
  insQuote.run("FORM-2025-002","2025-06-17T14:32:00Z",
    JSON.stringify({name:"Leonor Pinto",email:"leonor.p@example.com",project_type:"Roller Dress",description:"Need a competition roller dress for January 2026. Purple and gold theme, rhinestones."}));
  insQuote.run("FORM-2025-003","2025-06-18T08:55:00Z",
    JSON.stringify({name:"Tomas Guerreiro",email:"tomas.g@example.com",project_type:"Prop",description:"Looking to commission a Keyblade (Kingdom Hearts) — about 1m long, foam/worbla okay."}));
})();

db.pragma("foreign_keys = ON");
db.close();

console.log("\n Done!");
console.log("   10 clients");
console.log("   7 categories");
console.log("   47 projects (41 commissions + 6 personal)");
console.log("   Payments for all commissions (advance + final)");
console.log("   Daily time logs Jan 2024 to Jun 2025");
console.log("   6 calendar events (vacations, conventions, contest)");
console.log("   30 days of social snapshots (YouTube, Instagram, TikTok)");
console.log("   8 YouTube videos + 12 Instagram posts");
console.log("   3 unread client quote requests");
