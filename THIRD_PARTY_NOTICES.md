# Componenti di terze parti

Bolter Theme include nel codice distribuito (bundle in `assets/`, snippet generati) i componenti elencati qui sotto. Restano di proprietà dei rispettivi autori e sono distribuiti con licenza MIT, il cui testo è riportato in fondo. Il resto del tema è proprietario: vedi [LICENSE](LICENSE).

| Componente | Versione | Dove finisce nel tema | Copyright |
|---|---|---|---|
| [Motion](https://motion.dev) (`motion`, `motion-dom`, `motion-utils`) | 14.x | bundle JS delle animazioni | Copyright (c) 2024 Motion B.V. |
| [Framer Motion](https://github.com/motiondivision/motion) (`framer-motion`, dipendenza di `motion`) | 14.x | bundle JS delle animazioni | Copyright (c) 2018 Framer B.V. |
| [Lenis](https://github.com/darkroom-engineering/lenis) | 1.3.27 | bundle JS dello scorrimento morbido | Copyright (c) 2024 darkroom.engineering |
| [Heroicons](https://heroicons.com) | 2.2.0 | `snippets/icon.liquid` (SVG generati da `npm run icons`) | Copyright (c) Tailwind Labs, Inc. |
| [Tailwind CSS](https://tailwindcss.com) | 4.x | CSS generato (reset Preflight e utility) | Copyright (c) Tailwind Labs, Inc. |

Gli strumenti usati solo per lo sviluppo e la build (Vite, `vite-plugin-shopify`, Shopify CLI, ecc.) non sono inclusi nel tema distribuito; le loro licenze si trovano nei rispettivi pacchetti in `node_modules/`.

Quando si aggiunge una dipendenza che finisce nei bundle o nei file del tema, va aggiunta a questa tabella con il suo avviso di copyright.

## Testo della licenza MIT

```
Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
