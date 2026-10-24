import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { validate, normalizeFamily } from './validation.mjs';
const databasePath=process.env.KINFOLK_DB_PATH||'data/family.sqlite';
mkdirSync(dirname(databasePath), { recursive: true });
const db = new DatabaseSync(databasePath);
db.exec('CREATE TABLE IF NOT EXISTS family (id INTEGER PRIMARY KEY, value TEXT NOT NULL)');
const empty = { name: 'My family', people: [], relationships: [] };
if (!db.prepare('SELECT id FROM family WHERE id=1').get()) db.prepare('INSERT INTO family VALUES (1, ?)').run(JSON.stringify(empty));
const saved = db.prepare('SELECT value FROM family WHERE id=1').get();
const normalized = normalizeFamily(JSON.parse(saved.value));
if (normalized.changed) db.prepare('UPDATE family SET value=? WHERE id=1').run(JSON.stringify(normalized.value));
const server = http.createServer(async (req, res) => {
  const send = (status, value) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(value)); };
  if (req.headers.origin && req.headers.origin !== `http://${req.headers.host}`) return send(403, { error: 'Origin not allowed' });
  if (req.url === '/api/family') {
    if (req.method === 'GET') return send(200, JSON.parse(db.prepare('SELECT value FROM family WHERE id=1').get().value));
    if (req.method === 'PUT') {
      try {
        let body = ''; for await (const chunk of req) { body += chunk; if (body.length > 12e6) throw Error('Family file is too large'); }
        const family = normalizeFamily(JSON.parse(body)).value; validate(family);
        db.prepare('UPDATE family SET value=? WHERE id=1').run(JSON.stringify(family)); return send(200, { saved: true });
      } catch (e) { return send(400, { error: e.message }); }
    }
    return send(405, { error: 'Method not allowed' });
  }
  const files = { '/': ['index.html', 'text/html'], '/app.js': ['app.js','text/javascript'], '/graph.js':['graph.js','text/javascript'], '/validation.mjs':['../validation.mjs','text/javascript'], '/relationships.mjs':['relationships.mjs','text/javascript'], '/style.css':['style.css','text/css'] };
  const file = files[req.url?.split('?')[0]];
  if (!file) return send(404, { error: 'Not found' });
  res.writeHead(200, { 'Content-Type': file[1], 'X-Content-Type-Options': 'nosniff' }); res.end(readFileSync(new URL(`./public/${file[0]}`, import.meta.url)));
});
const port=Number(process.env.PORT||3000);
server.listen(port, '127.0.0.1', () => console.log(`Kinfolk is running at http://localhost:${port}`));
