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
public/assets/brand/logo-hte.svg  logotipo oficial vetorizado
public/assets/js/instrument3d.js  transmissor 3D (gerado a partir de src/, não editar)
public/assets/img/transmissor-3d.webp  imagem do 3D, mostrada enquanto ele carrega ou sem WebGL
src/instrument3d.js             código-fonte do transmissor 3D (Three.js)
```

## Transmissor 3D

O modelo da seção de calibração é feito em código (Three.js), sem arquivo de CAD. Ele só é baixado quando a seção chega perto da tela. Depois de mexer em `src/instrument3d.js`:

```
npm install
npm run build:3d
```

## Logotipo

O logo vem de `../marca/logo-hte-original.webp`, vetorizado em `public/assets/brand/logo-hte.svg`. Na página, ele fica como `<symbol id="logo-hte">` no topo do `index.html`: o "HTE" leva o degradê da marca (`#hte-grad`) e o "Heat Exchange" segue a cor do texto (preto no topo, branco no rodapé).

## WhatsApp

O número fica em `public/assets/js/main.js` (`WHATSAPP`) e nos links `https://wa.me/552732081411` do `public/index.html`. Cada botão tem um `data-wa` com a mensagem que já chega escrita no WhatsApp; para mudar o texto, edite esse atributo.

## Pendências

- **Fotos:** nenhuma ainda. As fotos de produto das quatro marcas (Alfa Laval, Flowserve, Endress+Hauser e Spirax Sarco) entram nos blocos de cada marca. O desenho da placa no topo, os símbolos P&ID, o diagrama de vapor e o 3D são feitos no código.
- **Prévia de link:** falta uma `og:image` (1200×630) para a prévia no WhatsApp e no LinkedIn.

## Ver no computador

Na pasta `public/`:

```
python3 -m http.server 8000
```

Depois abra http://localhost:8000.

## Publicar

No ar em **https://hte-heat-exchange.pages.dev** (Cloudflare Pages, projeto `hte-heat-exchange`, só arquivos estáticos).

Para publicar uma nova versão, nesta pasta (`site/`):

```
npx wrangler pages deploy --branch main
```

O `--branch main` publica em produção; sem ele, o Pages cria só uma prévia com o nome do branch do git. O `wrangler.jsonc` publica só a pasta `public/`. O `canonical` e o `og:url` do `public/index.html` já apontam para https://www.grupohte.com.br/, então o endereço pages.dev não concorre com o site atual no Google. Quando o domínio for ligado ao projeto, não precisa mudar nada.
