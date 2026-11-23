// API do sistema do casamento: guarda convidados, after e fornecedores no KV.
const COLS = ["convidados", "after", "fornecedores"];
const json = (d, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });

async function ler(env) {
  return (await env.DADOS.get("estado", "json")) || { convidados: [], after: [], fornecedores: [] };
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (!url.pathname.startsWith("/api/")) return env.ASSETS.fetch(req);
    if (req.headers.get("x-senha") !== env.SENHA) return json({ erro: "senha" }, 401);

    const [, , col, id] = url.pathname.split("/");
    if (col === "estado" && req.method === "GET") return json(await ler(env));
    if (!COLS.includes(col) || !id || id.length > 100) return json({ erro: "caminho" }, 400);

    const st = await ler(env);
    st[col] = st[col] || [];
    if (req.method === "PUT") {
      const item = await req.json();
      if (!item || typeof item !== "object") return json({ erro: "corpo" }, 400);
      item.id = id;
      const i = st[col].findIndex(x => x.id === id);
      if (i < 0) st[col].push(item); else st[col][i] = item;
    } else if (req.method === "DELETE") {
      st[col] = st[col].filter(x => x.id !== id);
    } else return json({ erro: "metodo" }, 405);
    await env.DADOS.put("estado", JSON.stringify(st));
    return json({ ok: true });
  }
};
