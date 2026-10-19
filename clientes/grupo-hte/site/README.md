# HTE Heat Exchange — site

Site institucional da HTE (grupohte.com.br). Página única, estática (HTML, CSS e JS puros), sem build. O conteúdo é o mesmo do site atual; as fotos ainda não entraram.

## Estrutura

```
index.html               página única (todo o texto fica aqui)
assets/css/styles.css    estilos (cores e fontes em :root)
assets/js/main.js        WhatsApp, menu do celular, destaque da seção no menu
assets/fonts/            Archivo e IBM Plex Mono (licença OFL)
assets/favicon.svg       ícone da aba
```

## WhatsApp

O número fica em `assets/js/main.js` (`WHATSAPP`) e nos links `https://wa.me/552732081411` do `index.html`. Cada botão tem um `data-wa` com a mensagem que já chega escrita no WhatsApp; para mudar o texto, edite esse atributo.

## Pendências

- **Logotipo:** o "HTE / Heat Exchange" do topo e do rodapé é tipográfico, provisório. Com o arquivo oficial em SVG, substitua o conteúdo de `.brand` no `index.html`.
- **Fotos:** nenhuma ainda. O desenho da placa no topo é SVG feito no código.
- **Prévia de link:** falta uma `og:image` (1200×630) para a prévia no WhatsApp e no LinkedIn.

## Ver no computador

```
python3 -m http.server 8000
```

Depois abra http://localhost:8000 na pasta `site/`.
