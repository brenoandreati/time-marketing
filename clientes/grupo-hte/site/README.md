# HTE Heat Exchange — site

Site institucional da HTE (grupohte.com.br). Página única, estática (HTML, CSS e JS puros), sem build. O conteúdo é o mesmo do site atual; as fotos ainda não entraram.

## Estrutura

```
public/                         tudo o que vai para o ar
public/index.html               página única (todo o texto fica aqui)
public/assets/css/styles.css    estilos (cores e fontes em :root)
public/assets/js/main.js        WhatsApp, menu do celular, destaque da seção no menu
public/assets/fonts/            Archivo e IBM Plex Mono (licença OFL)
public/assets/favicon.svg       ícone da aba
```

## WhatsApp

O número fica em `public/assets/js/main.js` (`WHATSAPP`) e nos links `https://wa.me/552732081411` do `public/index.html`. Cada botão tem um `data-wa` com a mensagem que já chega escrita no WhatsApp; para mudar o texto, edite esse atributo.

## Pendências

- **Logotipo:** o "HTE / Heat Exchange" do topo e do rodapé é tipográfico, provisório. Com o arquivo oficial em SVG, substitua o conteúdo de `.brand` no `public/index.html`.
- **Fotos:** nenhuma ainda. O desenho da placa no topo é SVG feito no código.
- **Prévia de link:** falta uma `og:image` (1200×630) para a prévia no WhatsApp e no LinkedIn.

## Ver no computador

Na pasta `public/`:

```
python3 -m http.server 8000
```

Depois abra http://localhost:8000.

## Publicar

No ar em **https://hte-heat-exchange.brenoandreati.workers.dev** (Cloudflare Worker `hte-heat-exchange`, só arquivos estáticos).

Para publicar uma nova versão, nesta pasta (`site/`):

```
npx wrangler deploy
```

O `wrangler.jsonc` publica só a pasta `public/`. O `canonical` e o `og:url` do `public/index.html` já apontam para https://www.grupohte.com.br/, então o endereço workers.dev não concorre com o site atual no Google. Quando o domínio for ligado ao Worker, não precisa mudar nada.
