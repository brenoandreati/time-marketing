---
name: comentarios
description: O atendimento do time. Lê os comentários de um post do Instagram e escreve a resposta de cada um e a DM de quem pediu algo (palavra-chave, preço, link, dúvida). Use quando pedirem "responde meus comentários", "o que eu respondo", "escreve as DMs", "tenho X comentários pedindo o material" ou colarem/mandarem print de comentários.
---

# Comentários · o atendimento

Cada comentário é uma conversa começando. Esta skill escreve as respostas e as DMs. **Quem envia é você**: a skill não acessa sua conta e nunca manda nada sozinha.

## 1. O que pedir

- Os comentários: colados como texto, print, ou exportados (CSV/planilha). Com o @ de quem comentou, se tiver.
- Do que era o post (1 linha) e, se houver, a **palavra-chave** e o **entregável** (link, PDF, guia).
- Leia `~/.claude/time-de-conteudo/marca.md` (tom, palavra-chave → entregável). Sem ele, faça o onboarding descrito na skill `reel` (seção "Marca").
Nunca invente link, preço ou condição. Se o entregável não foi informado, deixe `[LINK]` e avise.

## 2. Classificar cada comentário

| Tipo | O que fazer |
|---|---|
| **palavra-chave** | resposta pública curta ("te mandei no direct!") + DM com o entregável |
| **pedido** (preço, link, como contratar) | resposta pública que puxa pro direct + DM que responde e faz 1 pergunta |
| **dúvida** | resposta pública que responde de verdade (vira conteúdo pra quem lê) |
| **elogio / marcação de amigo** | agradece com algo específico do comentário + uma pergunta |
| **crítica** | responde com calma e fato; nunca discute; oferece resolver no direct |
| **spam / ódio / golpe** | não responde: sugira ocultar, apagar ou bloquear |

## 3. Escrever

- Respostas públicas curtas (até 2 linhas) e **variadas**: nunca o mesmo texto em sequência (respostas idênticas em massa parecem robô e podem ser limitadas pelo Instagram).
- Use o nome/@ da pessoa quando ajudar. Tom da marca.
- **DM:** cumprimenta, entrega o que foi pedido logo na 1ª mensagem, uma pergunta pra continuar a conversa ("você já usa…?"). Sem textão.
- Marque como **prioridade** quem demonstrou intenção de compra.

## 4. Entrega

```
## Prioridade (responder primeiro)
...

## Respostas
| @ | Comentário | Tipo | Resposta pública | DM |
|---|------------|------|------------------|----|

## Ocultar/apagar
...

## Ideias de conteúdo (dúvidas que se repetiram)
...
```
Salve como `respostas-<post>.md` na pasta atual pra você copiar e colar no app.
