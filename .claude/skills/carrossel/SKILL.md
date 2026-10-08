---
name: carrossel
description: A designer do time. Escreve e renderiza um carrossel do Instagram (PNG 1080x1350) a partir de um tema, link ou anotação — da capa que faz parar até o último slide que faz salvar. Use quando pedirem "faz um carrossel", "carrossel sobre X", "transforma isso em carrossel", "post de vários slides" ou mandarem um texto pra virar slides.
---

# Carrossel · a designer

Escreve os slides e gera as imagens prontas pra postar, no seu computador (Python + Pillow, sem API paga).

## 1. Antes

1. **Marca:** leia `~/.claude/time-de-conteudo/marca.md` (@ e cor). Se não existir, faça o onboarding descrito na skill `reel` (seção "Marca") ou pergunte o @ e a cor.
2. **Assunto e fonte:** se veio link, leia. Número e nome só se estiverem na fonte.
3. **Tamanho:** padrão 7 slides (capa + 5 de conteúdo + fechamento). Máx. 10.

## 2. Como escrever

- **Capa (slide 1):** promessa específica em até ~10 palavras, com a palavra de valor em `*destaque*`. Subtítulo curto que abre curiosidade ("o 3º quase todo mundo comete"). Nada de "Thread", "Dicas", "Parte 1".
- **Meio:** uma ideia por slide. Título curto (até ~8 palavras) + texto de no máximo ~30 palavras. Use `rotulo` pra numerar ("Erro 1", "Passo 2").
- **Penúltimo:** a virada ou o resumo prático (lista de 3).
- **Último (`cta`):** o slide que faz **salvar**. Diga por que guardar ("pra revisar seu perfil hoje") + um pedido só (salvar ou mandar pra alguém).
- Escreva na voz da marca, frases curtas, sem jargão. Nunca invente estatística.

## 3. Gerar as imagens

1. Escreva `carrossel-<assunto>.json` na pasta atual no formato de `exemplo.json` (nesta pasta da skill):
   - `arroba`, `cor` (hex), `tema` (`escuro` ou `claro`), `slides`.
   - tipos: `capa` (`titulo`, `sub`), `texto` (`rotulo`, `titulo`, `texto`), `lista` (`rotulo`, `titulo`, `itens`), `cta` (`titulo`, `texto`).
   - `*palavra*` = destaque na cor da marca. `|` força quebra de linha.
2. Rode: `python "<pasta desta skill>/render.py" carrossel-<assunto>.json`
   - Sem Pillow: peça permissão e rode `pip install pillow`.
   - Fonte: usa Segoe UI/Arial do sistema. Pra outra fonte, ponha `"fontes": {"titulo": "C:/caminho/Fonte-Bold.ttf", "texto": "..."}` no JSON.
3. **Confira as imagens** (abra os PNG): texto cortado, slide vazio, destaque errado. Ajuste o JSON e rode de novo.

As imagens saem em `carrossel-<assunto>/01.png, 02.png…`, na ordem de postar.

## 4. Entrega

- A pasta com os PNG.
- Texto alternativo curto pra cada slide (acessibilidade).
- Ofereça a legenda (skill `legenda`).
