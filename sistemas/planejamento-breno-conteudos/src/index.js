import { DurableObject } from "cloudflare:workers";

// Banco de dados: um Durable Object com SQLite (grátis no plano free da Cloudflare).
export class Banco extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.sql.exec(
      "CREATE TABLE IF NOT EXISTS itens (id TEXT PRIMARY KEY, tipo TEXT NOT NULL, dados TEXT NOT NULL, atualizado INTEGER NOT NULL)"
    );
    this.sql.exec("CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v INTEGER)");
  }
  versao() {
    const r = this.sql.exec("SELECT v FROM meta WHERE k = 'versao'").toArray();
    return r.length ? r[0].v : 0;
  }
  subir() {
    const v = this.versao() + 1;
    this.sql.exec(
      "INSERT INTO meta (k, v) VALUES ('versao', ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v",
      v
    );
    return v;
  }
  dados() {
    const itens = this.sql
      .exec("SELECT id, tipo, dados FROM itens")
      .toArray()
      .map((r) => ({ id: r.id, tipo: r.tipo, dados: JSON.parse(r.dados) }));
    return { versao: this.versao(), itens };
  }
  gravar(it) {
    this.sql.exec(
      "INSERT INTO itens (id, tipo, dados, atualizado) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET tipo = excluded.tipo, dados = excluded.dados, atualizado = excluded.atualizado",
      it.id,
      it.tipo,
      JSON.stringify(it.dados),
      Date.now()
    );
  }
  salvar(itens, apagar) {
    const antes = this.versao();
    this.ctx.storage.transactionSync(() => {
      for (const it of itens) this.gravar(it);
      for (const id of apagar) this.sql.exec("DELETE FROM itens WHERE id = ?", id);
    });
    return { antes, versao: this.subir() };
  }
  restaurar(itens) {
    this.ctx.storage.transactionSync(() => {
      this.sql.exec("DELETE FROM itens");
      for (const it of itens) this.gravar(it);
    });
    return { versao: this.subir() };
  }
}

const enc = new TextEncoder();
const UM_ANO = 60 * 60 * 24 * 365;

function json(obj, status = 200, extra = {}) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...extra },
  });
}
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");

async function assinar(env, msg) {
  const chave = await crypto.subtle.importKey(
    "raw",
    enc.encode("sessao|" + env.SENHA),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  return hex(await crypto.subtle.sign("HMAC", chave, enc.encode(msg)));
}
async function sha(s) {
  return hex(await crypto.subtle.digest("SHA-256", enc.encode(s)));
}
async function logado(req, env) {
  const m = (req.headers.get("cookie") || "").match(/(?:^|;\s*)sessao=([0-9]+)\.([0-9a-f]+)/);
  if (!m) return false;
  if (Number(m[1]) < Date.now() / 1000) return false;
  return (await assinar(env, m[1])) === m[2];
}

function validos(lista) {
  if (!Array.isArray(lista)) return [];
  return lista.filter(
    (it) =>
      it &&
      typeof it.id === "string" &&
      it.id.length > 0 &&
      it.id.length <= 100 &&
      (it.tipo === "ideia" || it.tipo === "post") &&
      it.dados &&
      typeof it.dados === "object"
  );
}

async function api(req, env, url) {
  const p = url.pathname;

  if (p === "/api/login" && req.method === "POST") {
    if (!env.SENHA) return json({ erro: "Senha não configurada" }, 500);
    const corpo = await req.json().catch(() => ({}));
    if ((await sha(String(corpo.senha || ""))) !== (await sha(env.SENHA))) {
      await new Promise((r) => setTimeout(r, 800));
      return json({ erro: "Senha errada" }, 401);
    }
    const exp = String(Math.floor(Date.now() / 1000) + UM_ANO);
    const token = exp + "." + (await assinar(env, exp));
    return json({ ok: true }, 200, {
      "set-cookie": `sessao=${token}; Path=/; Max-Age=${UM_ANO}; HttpOnly; Secure; SameSite=Lax`,
    });
  }
  if (p === "/api/sair" && req.method === "POST") {
    return json({ ok: true }, 200, { "set-cookie": "sessao=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax" });
  }

  if (!(await logado(req, env))) return json({ erro: "Precisa entrar" }, 401);
  const banco = env.BANCO.get(env.BANCO.idFromName("principal"));

  if (p === "/api/dados" && req.method === "GET") return json(await banco.dados());
  if (p === "/api/versao" && req.method === "GET") return json({ versao: (await banco.dados()).versao });
  if (p === "/api/salvar" && req.method === "POST") {
    const corpo = await req.json();
    const apagar = Array.isArray(corpo.apagar) ? corpo.apagar.filter((x) => typeof x === "string") : [];
    return json(await banco.salvar(validos(corpo.itens), apagar));
  }
  if (p === "/api/backup" && req.method === "GET") {
    const d = await banco.dados();
    const hoje = new Date().toISOString().slice(0, 10);
    return json({ sistema: "planejamento-breno-conteudos", exportado: new Date().toISOString(), ...d }, 200, {
      "content-disposition": `attachment; filename="backup-conteudo-${hoje}.json"`,
    });
  }
  if (p === "/api/restaurar" && req.method === "POST") {
    const corpo = await req.json();
    return json(await banco.restaurar(validos(corpo.itens)));
  }
  return json({ erro: "Não encontrado" }, 404);
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (!url.pathname.startsWith("/api/")) return env.ASSETS.fetch(req);
    try {
      return await api(req, env, url);
    } catch (e) {
      return json({ erro: "Erro no servidor" }, 500);
    }
  },
};
