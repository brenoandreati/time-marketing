#!/usr/bin/env python3
"""Renderiza os slides de um carrossel do Instagram (1080x1350) a partir de um JSON.

Uso:
    python render.py slides.json [pasta_de_saida]

Precisa do Pillow (pip install pillow). Roda 100% no seu computador.
Formato do JSON: veja exemplo.json nesta pasta.
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

try:
    from PIL import Image, ImageDraw, ImageFont
except ImportError:
    sys.exit("Falta o Pillow. Rode: pip install pillow")

W, H = 1080, 1350
M = 96  # margem lateral
TOPO, BASE = 190, 1190  # area util do conteudo

TEMAS = {
    "escuro": {"fundo": "#0F0F12", "texto": "#F4F4F5", "apagado": "#8E8E96", "linha": "#26262C"},
    "claro": {"fundo": "#F6F4EF", "texto": "#141416", "apagado": "#6B6B73", "linha": "#E2DED6"},
}

FONTES = {
    "titulo": [
        "C:/Windows/Fonts/segoeuib.ttf",
        "C:/Windows/Fonts/arialbd.ttf",
        "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
        "/Library/Fonts/Arial Bold.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
    ],
    "texto": [
        "C:/Windows/Fonts/segoeui.ttf",
        "C:/Windows/Fonts/arial.ttf",
        "/System/Library/Fonts/Supplemental/Arial.ttf",
        "/Library/Fonts/Arial.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
    ],
}

_cache: dict = {}


def fonte(tipo: str, tamanho: int, extra: dict) -> ImageFont.FreeTypeFont:
    chave = (tipo, tamanho)
    if chave in _cache:
        return _cache[chave]
    candidatos = ([extra[tipo]] if extra.get(tipo) else []) + FONTES[tipo]
    for caminho in candidatos:
        if Path(caminho).exists():
            _cache[chave] = ImageFont.truetype(caminho, tamanho)
            return _cache[chave]
    sys.exit(f"Nenhuma fonte encontrada para '{tipo}'. Informe o caminho de um .ttf em \"fontes\" no JSON.")


def tokens(texto: str) -> list:
    """Paragrafos (\n ou |) -> palavras -> pedacos (texto, destaque). *trecho* vira destaque.
    Pontuacao colada no destaque ("*voce*,") fica na mesma palavra."""
    paragrafos = []
    for par in re.split(r"\n|\|", texto or ""):
        palavras, colar = [], False
        for i, parte in enumerate(par.split("*")):
            dest = i % 2 == 1
            if not parte:
                continue
            pedacos = parte.split()
            if not pedacos:
                colar = False
                continue
            for j, w in enumerate(pedacos):
                if j == 0 and colar and not parte[0].isspace() and palavras:
                    palavras[-1].append((w, dest))
                else:
                    palavras.append([(w, dest)])
            colar = not parte[-1].isspace()
        paragrafos.append(palavras)
    return paragrafos


def larg(palavra, f):
    return sum(f.getlength(t) for t, _ in palavra)


def quebrar(paragrafos, f, largura):
    linhas = []
    espaco = f.getlength(" ")
    for palavras in paragrafos:
        atual, w_atual = [], 0.0
        for p in palavras:
            lw = larg(p, f)
            if atual and w_atual + espaco + lw > largura:
                linhas.append(atual)
                atual, w_atual = [], 0.0
            w_atual += (espaco if atual else 0) + lw
            atual.append(p)
        linhas.append(atual)
    return linhas


def largura_linha(linha, f):
    return sum(larg(p, f) for p in linha) + f.getlength(" ") * max(len(linha) - 1, 0)


def medir(texto, tipo, tam, largura, extra, entre):
    f = fonte(tipo, tam, extra)
    linhas = quebrar(tokens(texto), f, largura) if texto else []
    if any(largura_linha(l, f) > largura for l in linhas):  # palavra maior que a linha
        return f, linhas, float("inf")
    return f, linhas, len(linhas) * tam * entre


def escrever(d, x, y, linhas, f, cor, cor_dest, entre, centro=False):
    tam = f.size
    espaco = f.getlength(" ")
    for i, linha in enumerate(linhas):
        cx = x - largura_linha(linha, f) / 2 if centro else x
        for p in linha:
            for t, dest in p:
                d.text((cx, y + i * tam * entre), t, font=f, fill=cor_dest if dest else cor)
                cx += f.getlength(t)
            cx += espaco
    return len(linhas) * tam * entre


def marcador(d, cx, top, cor, larg=120, alt=160):
    """Icone de 'salvar' (marcador do Instagram) desenhado."""
    x0, x1 = cx - larg / 2, cx + larg / 2
    d.polygon([(x0, top), (x1, top), (x1, top + alt), (cx, top + alt * 0.72), (x0, top + alt)], fill=cor)


def slide(dados, s, i, n, pasta):
    tema = TEMAS.get(dados.get("tema", "escuro"), TEMAS["escuro"])
    acento = dados.get("cor", "#E5484D")
    extra = dados.get("fontes", {})
    img = Image.new("RGB", (W, H), tema["fundo"])
    d = ImageDraw.Draw(img)
    largura = W - 2 * M

    # topo: @ e numero do slide
    f_topo = fonte("texto", 30, extra)
    d.text((M, 84), dados.get("arroba", ""), font=f_topo, fill=tema["apagado"])
    num = f"{i:02d}/{n:02d}"
    d.text((W - M - f_topo.getlength(num), 84), num, font=f_topo, fill=tema["apagado"])

    # base: barra de progresso
    d.rounded_rectangle((M, H - 92, W - M, H - 86), 3, fill=tema["linha"])
    d.rounded_rectangle((M, H - 92, M + largura * i / n, H - 86), 3, fill=acento)

    tipo = s.get("tipo", "texto")
    altura = BASE - TOPO

    if tipo == "capa":
        # titulo o maior possivel; subtitulo proporcional; bloco centrado na vertical
        for tt in range(132, 56, -4):
            ft, lt, ht = medir(s.get("titulo", ""), "titulo", tt, largura, extra, 1.1)
            fs, ls, hs = medir(s.get("sub", ""), "texto", max(32, round(tt * 0.4)), largura, extra, 1.3)
            bloco = 58 + ht + (40 + hs if hs else 0)
            if bloco <= altura - 120:
                break
        y = TOPO + (altura - 80 - bloco) / 2
        d.rounded_rectangle((M, y, M + 110, y + 16), 8, fill=acento)
        y += 58
        y += escrever(d, M, y, lt, ft, tema["texto"], acento, 1.1)
        if hs:
            escrever(d, M, y + 40, ls, fs, tema["apagado"], acento, 1.3)
        f_seta = fonte("titulo", 32, extra)
        txt = "arrasta  →"
        lw = f_seta.getlength(txt)
        d.rounded_rectangle((W - M - lw - 60, H - 200, W - M, H - 134), 33, fill=acento)
        d.text((W - M - lw - 30, H - 186), txt, font=f_seta, fill=tema["fundo"])

    elif tipo == "cta":
        for tt in range(112, 48, -4):
            ft, lt, ht = medir(s.get("titulo", ""), "titulo", tt, largura, extra, 1.12)
            fs, ls, hs = medir(s.get("texto", ""), "texto", max(30, round(tt * 0.44)), largura, extra, 1.35)
            bloco = 200 + 60 + ht + (44 + hs if hs else 0)
            if bloco <= altura:
                break
        y = TOPO + (altura - bloco) / 2
        marcador(d, W / 2, y, acento, 140, 190)
        y += 260
        y += escrever(d, W / 2, y, lt, ft, tema["texto"], acento, 1.12, centro=True)
        if hs:
            escrever(d, W / 2, y + 44, ls, fs, tema["apagado"], acento, 1.35, centro=True)

    else:  # texto ou lista
        rot = (s.get("rotulo") or "").upper()
        h_rot = 110 if rot else 0
        itens = s.get("itens", []) if tipo == "lista" else []
        for tt in range(112, 44, -4):
            ts = max(30, round(tt * 0.5))
            ft, lt, ht = medir(s.get("titulo", ""), "titulo", tt, largura, extra, 1.12)
            if itens:
                fs = fonte("texto", ts, extra)
                blocos = [quebrar(tokens(it), fs, largura - 110) for it in itens]
                hs = sum(len(b) * ts * 1.3 for b in blocos) + 40 * (len(blocos) - 1)
            else:
                fs, ls, hs = medir(s.get("texto", ""), "texto", ts, largura, extra, 1.38)
            bloco = h_rot + ht + (56 + hs if hs else 0)
            if bloco <= altura:
                break
        y = TOPO + (altura - bloco) / 2
        if rot:
            f_rot = fonte("titulo", 32, extra)
            lw = f_rot.getlength(rot)
            d.rounded_rectangle((M, y, M + lw + 44, y + 58), 29, outline=acento, width=3)
            d.text((M + 22, y + 10), rot, font=f_rot, fill=acento)
            y += h_rot
        y += escrever(d, M, y, lt, ft, tema["texto"], acento, 1.12) + 56
        if itens:
            r = round(ts * 0.68)
            fn = fonte("titulo", round(r * 1.1), extra)
            for k, linhas in enumerate(blocos, 1):
                cy = y + ts * 1.3 / 2
                d.ellipse((M, cy - r, M + 2 * r, cy + r), fill=acento)
                d.text((M + r, cy), str(k), font=fn, fill=tema["fundo"], anchor="mm")
                y += escrever(d, M + 110, y, linhas, fs, tema["texto"], acento, 1.3) + 40
        elif hs:
            escrever(d, M, y, ls, fs, tema["apagado"], acento, 1.38)

    saida = pasta / f"{i:02d}.png"
    img.save(saida, optimize=True)
    return saida


def main():
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    arq = Path(sys.argv[1])
    dados = json.loads(arq.read_text(encoding="utf-8"))
    pasta = Path(sys.argv[2]) if len(sys.argv) > 2 else arq.parent / arq.stem
    pasta.mkdir(parents=True, exist_ok=True)
    slides = dados.get("slides", [])
    if not slides:
        sys.exit("O JSON nao tem slides.")
    for i, s in enumerate(slides, 1):
        print(slide(dados, s, i, len(slides), pasta))


if __name__ == "__main__":
    main()
