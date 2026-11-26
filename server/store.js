/*
 * Neon Hop – Speicher für Online-Level.
 *
 * Zwei Umsetzungen mit derselben Schnittstelle:
 *   PgStore      Postgres (z.B. kostenlos bei neon.tech), Variable DATABASE_URL
 *   MemoryStore  Arbeitsspeicher, wenn keine Datenbank eingerichtet ist (lokal, Tests).
 *                Achtung: geht bei jedem Neustart verloren.
 */
'use strict';

const PAGE_SIZE = 8;
const SORTS = {
  neu: 'created_at desc',
  beliebt: 'likes desc, created_at desc',
  gespielt: 'plays desc, created_at desc',
};

function publicLevel(r, withRows) {
  const out = {
    id: r.id, name: r.name, author: r.author, theme: Number(r.theme), music: Number(r.music),
    difficulty: Number(r.difficulty), length: Number(r.length), objects: Number(r.objects),
    plays: Number(r.plays), likes: Number(r.likes), created: Number(r.created_at),
  };
  if (withRows) {
    // ältere Einträge: nur Zeilen; neuere: { rows, extras }
    const d = JSON.parse(r.data);
    out.rows = Array.isArray(d) ? d : d.rows;
    out.extras = Array.isArray(d) ? [] : (d.extras || []);
  }
  return out;
}
function adminLevel(r) {
  return Object.assign(publicLevel(r, false), { reports: Number(r.reports), hidden: !!r.hidden });
}

// ---------------------------------------------------------------------------
class MemoryStore {
  constructor() {
    this.kind = 'memory';
    this.levels = new Map();
    this.votes = new Set();
    this.infAll = new Map();   // Spieler -> { player, name, distance, created_at }
    this.infDay = new Map();   // Tag|Spieler -> { player, day, name, distance, created_at }
  }
  // ----- Infinity-Rangliste (pro Spieler zählt der beste Lauf, je Tag und insgesamt) -----
  async infSave({ player, name, distance, day, at }) {
    const a = this.infAll.get(player);
    if (!a || distance > a.distance) this.infAll.set(player, { player, name, distance, created_at: at });
    else a.name = name;
    const k = day + '|' + player, d = this.infDay.get(k);
    if (!d || distance > d.distance) this.infDay.set(k, { player, day, name, distance, created_at: at });
    else d.name = name;
  }
  infRows(range, day) {
    return range === 'day' ? [...this.infDay.values()].filter((r) => r.day === day) : [...this.infAll.values()];
  }
  async infTop(range, day, limit) {
    return this.infRows(range, day).sort((a, b) => b.distance - a.distance || a.created_at - b.created_at).slice(0, limit);
  }
  async infRank(range, day, player) {
    const rows = this.infRows(range, day);
    const me = rows.find((r) => r.player === player);
    if (!me) return null;
    // bei gleicher Distanz liegt der frühere Lauf vorne (wie in der Liste)
    return { rank: 1 + rows.filter((r) => r.distance > me.distance || (r.distance === me.distance && r.created_at < me.created_at)).length, distance: me.distance };
  }
  async infRemove(player) {
    const had = this.infAll.delete(player);
    for (const k of [...this.infDay.keys()]) if (k.endsWith('|' + player)) this.infDay.delete(k);
    return had;
  }
  async init() {}
  async findDuplicate(authorHash, data) {
    for (const l of this.levels.values()) if (l.author_hash === authorHash && l.data === data) return l.id;
    return null;
  }
  async create(rec) {
    this.levels.set(rec.id, Object.assign({ plays: 0, likes: 0, reports: 0, hidden: false }, rec));
  }
  async list({ sort, q, page }) {
    let arr = [...this.levels.values()].filter((l) => !l.hidden);
    if (q) {
      const n = q.toLowerCase();
      arr = arr.filter((l) => l.name.toLowerCase().includes(n) || l.author.toLowerCase().includes(n));
    }
    const by = {
      neu: (a, b) => b.created_at - a.created_at,
      beliebt: (a, b) => b.likes - a.likes || b.created_at - a.created_at,
      gespielt: (a, b) => b.plays - a.plays || b.created_at - a.created_at,
    }[sort];
    arr.sort(by);
    return { total: arr.length, items: arr.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map((l) => publicLevel(l, true)) };
  }
  async get(id, admin) {
    const l = this.levels.get(id);
    return l && (admin || !l.hidden) ? l : null;
  }
  async addPlay(id) {
    const l = this.levels.get(id);
    if (!l) return null;
    l.plays++;
    return l.plays;
  }
  async toggleLike(id, voter) {
    const l = this.levels.get(id);
    if (!l) return null;
    const key = id + '|' + voter + '|like';
    const liked = !this.votes.has(key);
    if (liked) this.votes.add(key); else this.votes.delete(key);
    l.likes = [...this.votes].filter((k) => k.startsWith(id + '|') && k.endsWith('|like')).length;
    return { liked, likes: l.likes };
  }
  async report(id, voter, hideAt) {
    const l = this.levels.get(id);
    if (!l) return null;
    const key = id + '|' + voter + '|report';
    if (this.votes.has(key)) return { hidden: l.hidden, already: true };
    this.votes.add(key);
    l.reports++;
    if (l.reports >= hideAt) l.hidden = true;
    return { hidden: l.hidden };
  }
  async remove(id) {
    const ok = this.levels.delete(id);
    for (const k of [...this.votes]) if (k.startsWith(id + '|')) this.votes.delete(k);
    return ok;
  }
  async setHidden(id, hidden) {
    const l = this.levels.get(id);
    if (!l) return false;
    l.hidden = !!hidden;
    if (!hidden) l.reports = 0;
    return true;
  }
  async adminList(filter) {
    let arr = [...this.levels.values()];
    if (filter === 'gemeldet') arr = arr.filter((l) => l.reports > 0 || l.hidden);
    arr.sort((a, b) => (filter === 'gemeldet' ? b.reports - a.reports : 0) || b.created_at - a.created_at);
    return arr.slice(0, 100).map(adminLevel);
  }
}

// ---------------------------------------------------------------------------
class PgStore {
  constructor(pool) {
    this.kind = 'postgres';
    this.db = pool;
  }
  q(text, params) { return this.db.query(text, params); }
  async init() {
    await this.q(`create table if not exists levels (
      id text primary key,
      name text not null,
      author text not null,
      author_hash text not null,
      theme integer not null,
      music integer not null,
      difficulty integer not null,
      data text not null,
      length integer not null,
      objects integer not null,
      plays integer not null default 0,
      likes integer not null default 0,
      reports integer not null default 0,
      hidden boolean not null default false,
      created_at bigint not null
    )`);
    await this.q(`create table if not exists infinity_best (
      player text primary key,
      name text not null,
      distance integer not null,
      created_at bigint not null
    )`);
    await this.q(`create table if not exists infinity_day (
      player text not null,
      day text not null,
      name text not null,
      distance integer not null,
      created_at bigint not null,
      primary key (player, day)
    )`);
    await this.q(`create table if not exists level_votes (
      level_id text not null,
      voter text not null,
      kind text not null,
      primary key (level_id, voter, kind)
    )`);
  }
  // ----- Infinity-Rangliste -----
  async infSave({ player, name, distance, day, at }) {
    const a = await this.q('select distance from infinity_best where player = $1', [player]);
    if (!a.rows.length) await this.q('insert into infinity_best (player, name, distance, created_at) values ($1, $2, $3, $4)', [player, name, distance, at]);
    else if (distance > Number(a.rows[0].distance)) await this.q('update infinity_best set name = $2, distance = $3, created_at = $4 where player = $1', [player, name, distance, at]);
    else await this.q('update infinity_best set name = $2 where player = $1', [player, name]);
    const d = await this.q('select distance from infinity_day where player = $1 and day = $2', [player, day]);
    if (!d.rows.length) await this.q('insert into infinity_day (player, day, name, distance, created_at) values ($1, $2, $3, $4, $5)', [player, day, name, distance, at]);
    else if (distance > Number(d.rows[0].distance)) await this.q('update infinity_day set name = $3, distance = $4, created_at = $5 where player = $1 and day = $2', [player, day, name, distance, at]);
    else await this.q('update infinity_day set name = $3 where player = $1 and day = $2', [player, day, name]);
  }
  async infTop(range, day, limit) {
    const r = range === 'day'
      ? await this.q('select player, name, distance, created_at from infinity_day where day = $1 order by distance desc, created_at asc limit $2', [day, limit])
      : await this.q('select player, name, distance, created_at from infinity_best order by distance desc, created_at asc limit $1', [limit]);
    return r.rows.map((x) => ({ player: x.player, name: x.name, distance: Number(x.distance), created_at: Number(x.created_at) }));
  }
  async infRank(range, day, player) {
    const me = range === 'day'
      ? await this.q('select distance, created_at from infinity_day where player = $1 and day = $2', [player, day])
      : await this.q('select distance, created_at from infinity_best where player = $1', [player]);
    if (!me.rows.length) return null;
    const dist = Number(me.rows[0].distance), at = Number(me.rows[0].created_at);
    // bei gleicher Distanz liegt der frühere Lauf vorne (wie in der Liste)
    const n = range === 'day'
      ? await this.q('select count(*) as n from infinity_day where day = $1 and (distance > $2 or (distance = $2 and created_at < $3))', [day, dist, at])
      : await this.q('select count(*) as n from infinity_best where distance > $1 or (distance = $1 and created_at < $2)', [dist, at]);
    return { rank: 1 + Number(n.rows[0].n), distance: dist };
  }
  async infRemove(player) {
    const r = await this.q('delete from infinity_best where player = $1', [player]);
    await this.q('delete from infinity_day where player = $1', [player]);
    return r.rowCount > 0;
  }
  async findDuplicate(authorHash, data) {
    const r = await this.q('select id from levels where author_hash = $1 and data = $2 limit 1', [authorHash, data]);
    return r.rows.length ? r.rows[0].id : null;
  }
  async create(rec) {
    await this.q(`insert into levels (id, name, author, author_hash, theme, music, difficulty, data, length, objects, created_at)
      values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
    [rec.id, rec.name, rec.author, rec.author_hash, rec.theme, rec.music, rec.difficulty, rec.data, rec.length, rec.objects, rec.created_at]);
  }
  async list({ sort, q, page }) {
    const order = SORTS[sort] || SORTS.neu;   // nur feste Werte, nie Nutzereingaben
    const params = [];
    let where = 'hidden = false';
    if (q) {
      params.push('%' + q.toLowerCase().replace(/[%_\\]/g, '') + '%');
      where += ' and (lower(name) like $1 or lower(author) like $1)';
    }
    const total = await this.q('select count(*) as n from levels where ' + where, params);
    params.push(PAGE_SIZE, (page - 1) * PAGE_SIZE);
    const rows = await this.q('select * from levels where ' + where + ' order by ' + order +
      ' limit $' + (params.length - 1) + ' offset $' + params.length, params);
    return { total: Number(total.rows[0].n), items: rows.rows.map((r) => publicLevel(r, true)) };
  }
  async get(id, admin) {
    const r = await this.q('select * from levels where id = $1', [id]);
    const l = r.rows[0];
    return l && (admin || !l.hidden) ? l : null;
  }
  async addPlay(id) {
    const r = await this.q('update levels set plays = plays + 1 where id = $1 and hidden = false returning plays', [id]);
    return r.rows.length ? Number(r.rows[0].plays) : null;
  }
  async toggleLike(id, voter) {
    if (!(await this.get(id))) return null;
    const del = await this.q("delete from level_votes where level_id = $1 and voter = $2 and kind = 'like' returning level_id", [id, voter]);
    const liked = del.rows.length === 0;
    if (liked) await this.q("insert into level_votes (level_id, voter, kind) values ($1, $2, 'like')", [id, voter]);
    const c = await this.q("select count(*) as n from level_votes where level_id = $1 and kind = 'like'", [id]);
    const likes = Number(c.rows[0].n);
    await this.q('update levels set likes = $2 where id = $1', [id, likes]);
    return { liked, likes };
  }
  async report(id, voter, hideAt) {
    const l = await this.get(id);
    if (!l) return null;
    const had = await this.q("select 1 from level_votes where level_id = $1 and voter = $2 and kind = 'report'", [id, voter]);
    if (had.rows.length) return { hidden: !!l.hidden, already: true };
    await this.q("insert into level_votes (level_id, voter, kind) values ($1, $2, 'report')", [id, voter]);
    const r = await this.q('update levels set reports = reports + 1, hidden = (reports + 1 >= $2) where id = $1 returning hidden', [id, hideAt]);
    return { hidden: !!r.rows[0].hidden };
  }
  async remove(id) {
    await this.q('delete from level_votes where level_id = $1', [id]);
    const r = await this.q('delete from levels where id = $1 returning id', [id]);
    return r.rows.length > 0;
  }
  async setHidden(id, hidden) {
    const r = await this.q(hidden
      ? 'update levels set hidden = true where id = $1 returning id'
      : 'update levels set hidden = false, reports = 0 where id = $1 returning id', [id]);
    if (!hidden) await this.q("delete from level_votes where level_id = $1 and kind = 'report'", [id]);
    return r.rows.length > 0;
  }
  async adminList(filter) {
    const r = await this.q(filter === 'gemeldet'
      ? 'select * from levels where reports > 0 or hidden = true order by reports desc, created_at desc limit 100'
      : 'select * from levels order by created_at desc limit 100');
    return r.rows.map(adminLevel);
  }
}

/** Speicher passend zur Umgebung anlegen. */
function createStore(env) {
  const url = (env || process.env).DATABASE_URL;
  if (!url) return new MemoryStore();
  const { Pool } = require('pg');
  const local = /@(localhost|127\.0\.0\.1)[:/]/.test(url) || /sslmode=disable/.test(url);
  return new PgStore(new Pool({ connectionString: url, max: 5, ssl: local ? false : { rejectUnauthorized: true } }));
}

module.exports = { createStore, MemoryStore, PgStore, PAGE_SIZE, publicLevel };
