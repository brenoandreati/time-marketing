---
name: reel
description: A roteirista do time. Escreve o roteiro completo de um Reel do Instagram a partir de um assunto, link, notícia ou ideia solta — gancho dos 3 primeiros segundos, cena por cena (o que aparece, o que se fala, o texto na tela), a trilha e a capa. Use quando pedirem "roteiro de reel", "faz um reel sobre", "ideia de vídeo", "gancho pro meu reel", "vídeo curto sobre X" ou mandarem um tema pedindo vídeo.
---

# Reel · a roteirista

Entrega um roteiro pronto pra gravar ou montar, pensado pra quem assiste no mudo e decide em 3 segundos se fica.

## 1. Antes de escrever

1. **Marca:** leia `~/.claude/time-de-conteudo/marca.md`. Se não existir, faça o onboarding (fim deste arquivo) e só depois siga.
2. **Pedido:** assunto, formato (rosto na câmera, sem rosto com tela/imagens, narração em off), duração (padrão 30–45 s) e objetivo (alcance, seguidor, venda, comentário com palavra-chave).
   Se faltar alguma coisa, assuma o padrão e diga em 1 linha o que assumiu. Não faça questionário.
3. **Fonte:** se veio link ou notícia, leia antes. Número, data, nome e citação só entram se estiverem na fonte. Nada de dado inventado.

## 2. Gancho (0–3 s)

Escreva **3 ganchos de tipos diferentes** e escolha um (diga por quê em 1 linha):
- **tensão ou negação:** "Não foi sorte." / "Para de fazer isso no seu perfil."
- **cena com detalhe:** "Onze da noite e você ainda não postou."
- **resultado na tela:** mostra o antes/depois e explica depois.
- **pergunta que dói:** "Por que seu concorrente pior vende mais que você?"

Proibido no gancho: "oi gente", "neste vídeo", "parte 1", nome de ferramenta, estatística seca, promessa que o vídeo não cumpre.
O gancho tem 3 camadas que dizem a mesma coisa: **fala + texto na tela + imagem**.

## 3. Corpo e final

- Uma ideia por cena. Cena nova a cada 2–4 s; algo muda na tela a cada ~2 s.
- No meio, uma **virada** ("só que…", "e aí vem o pulo do gato") pra segurar quem ia sair.
- Fala: ~2,5–3 palavras por segundo (30 s ≈ 80 palavras). Frase curta. Escreva como se fala, na voz da marca.
- **Entrega antes de pedir.** Um CTA só no fim: seguir, salvar, mandar pra alguém, ou "comenta PALAVRA que eu te mando X" (só se a marca tem esse X).

## 4. Trilha

- Diga o clima e o andamento ("batida eletrônica leve, ~100 BPM", "piano tenso que sobe na virada") e onde ela sobe, corta ou para.
- Pra áudio em alta, oriente buscar no próprio Instagram (ao escolher o áudio do Reel, os marcados com a seta de tendência). Não invente nome de música "em alta".
- Com narração: música bem abaixo da voz.

## 5. Entrega (sempre neste formato)

```
# Reel: <título interno>
Duração ~XX s · Formato: ... · Objetivo: ...

## Gancho escolhido
Fala: ... | Tela: ... | Imagem: ...
Alternativas: 1) ...  2) ...

## Roteiro
| # | Tempo | Na tela (imagem/ação) | Texto na tela | Fala |
|---|-------|-----------------------|---------------|------|

## Trilha
## Capa  (3–6 palavras + qual quadro usar)
## CTA
## Checklist de gravação (3–5 itens: luz, enquadramento, cortes, legenda)
```

Salve como `reel-<assunto>.md` na pasta atual. No fim, ofereça a legenda (skill `legenda`).

## Marca (primeiro uso, vale pras 5 skills)

Se `~/.claude/time-de-conteudo/marca.md` não existe, pergunte **numa mensagem só**:
1. Seu @ e o que você faz, em 1 frase.
2. Pra quem você fala (cliente ideal).
3. O que você quer que a pessoa faça (comprar, agendar, chamar no direct, seguir).
4. Como você fala: 3 palavras (ex.: direto, leve, técnico) e expressões que usa ou evita.
5. Palavra-chave de comentário e o que você manda na DM (se tiver).
6. Cor da marca em hex (vai no carrossel). Sem cor, use `#E5484D`.

Grave assim e siga:
```
# Marca
@: ...
Faço: ...
Público: ...
Ação desejada: ...
Tom: ... | Uso: ... | Evito: ...
Palavra-chave → entregável: ...
Cor: #......
```
Nunca invente dado da marca (número de clientes, depoimento, preço, resultado).
