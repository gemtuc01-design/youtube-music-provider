# YouTube Music Provider for SpotiFLAC Mobile

ExtensiÃ³n que agrega **YouTube Music** como fuente de bÃºsqueda, metadata y descarga en [SpotiFLAC Mobile](https://spotiflac.zarz.moe/). Busca temas, resuelve links de YT/YT Music y descarga el audio directamente desde la app.

![version](https://img.shields.io/badge/version-0.1.0-blue) ![type](https://img.shields.io/badge/type-metadata%20%2B%20download-green) ![minApp](https://img.shields.io/badge/minAppVersion-3.0.1-orange)

---

## Features

- ðŸ” **Search** dentro de YouTube Music (barra de bÃºsqueda propia, thumbnails 16:9)
- ðŸ”— **URL handler** para links de `music.youtube.com`, `youtube.com/watch` y `youtu.be`
- â¬‡ï¸ **Download** de audio (Opus ~160kbps / m4a AAC)
- âš™ï¸ **Auto-config**: scrapea la API key y client version de YT Music y las cachea 24h (cero mantenimiento manual)

---

## Installation

### Desde archivo (manual)

1. DescargÃ¡ `youtube-music-provider.spotiflac-ext` desde la secciÃ³n [Releases](#).
2. En la app: **Ajustes > Extensiones > Instalar extensiÃ³n**.
3. SeleccionÃ¡ el archivo `.spotiflac-ext`.
4. (Opcional) ConfigurÃ¡ la regiÃ³n en los ajustes de la extensiÃ³n.

### Desde repositorio

Si tenÃ©s el repo de extensiones configurado en la app, aparece en la pestaÃ±a **Repositorio** para instalar con un tap.

---

## Settings

| Setting | Tipo | Default | DescripciÃ³n |
| --- | --- | --- | --- |
| `region` | select (US/AR/MX/ES) | AR | RegiÃ³n para resultados y disponibilidad |
| `debug` | boolean | false | Logs de diagnÃ³stico en consola |

---

## Quality options

| ID | Formato | Nota |
| --- | --- | --- |
| `OPUS_160` | Opus ~160kbps (webm) | Mejor calidad nativa de YT |
| `MP3_320` | m4a AAC | YT **no** sirve MP3 nativo; se baja m4a y la app transcodifica |

---

## How it works

La extensiÃ³n usa la API interna **InnerTube** de YouTube (`youtubei/v1`):

- **Search / metadata**: cliente `WEB_REMIX` sobre `youtubei/v1/search`, parseando `musicResponsiveListItemRenderer` (banca los formatos viejo `musicShelfRenderer` y nuevo `itemSectionRenderer`).
- **Download**: cliente `ANDROID_MUSIC` sobre `youtubei/v1/player`, que devuelve URLs de stream **directas** (sin `signatureCipher` ni el throttling param `n`), evitando tener que ejecutar el JS del player. Es el mismo enfoque que usa yt-dlp.
- **Auto-config**: la API key y `clientVersion` se scrapean del HTML de `music.youtube.com` y se cachean en storage por 24h; si una request falla, se limpia el cache y se reintenta limpio.

---

## Project structure

```
youtube-music-provider.spotiflac-ext (ZIP)
â”œâ”€â”€ manifest.json   # Metadata, permisos, settings, qualityOptions
â”œâ”€â”€ index.js        # LÃ³gica: search, handleURL, download, resolveStream, fetchTrack
â””â”€â”€ icon.png        # Ãcono 128x128
```

---

## Development

1. EditÃ¡ `manifest.json` e `index.js`.
2. EmpaquetÃ¡ los 3 archivos en un ZIP y renombralo a `.spotiflac-ext`:
   ```bash
   zip -X youtube-music-provider.spotiflac-ext manifest.json index.js icon.png
   ```
3. ReinstalÃ¡ en la app para probar. ActivÃ¡ `debug` para ver logs.

GuÃ­a oficial: [Extension Development Guide](https://spotiflac.zarz.moe/docs)

---

## Troubleshooting

| Problema | Causa probable | SoluciÃ³n |
| --- | --- | --- |
| Search vacÃ­o | key/clientVersion caducados | La ext limpia cache sola; reintentÃ¡. Si persiste, revisÃ¡ conexiÃ³n. |
| Download da 403 | `clientVersion` de Android caducada | SubÃ­ el nÃºmero de `ANDROID_MUSIC` en `index.js` |
| "formato sin URL directa" | YT devolviÃ³ signatureCipher | ReintentÃ¡; si sigue, actualizÃ¡ la client version de Android |
| Ãlbum vacÃ­o en links sueltos | `videoDetails` no trae Ã¡lbum | Esperado; enriquecer con `browse` si se necesita |

---

## Roadmap

- [ ] Soporte de Ã¡lbumes y playlists en resultados de bÃºsqueda
- [ ] Enriquecer Ã¡lbum/ISRC en `fetchTrack`
- [ ] Scrapear tambiÃ©n la `clientVersion` de Android
- [ ] Lyrics provider

---

## Disclaimer

Proyecto no oficial, sin afiliaciÃ³n con YouTube ni Google. UsÃ¡ la extensiÃ³n respetando los tÃ©rminos de servicio de las plataformas y las leyes de tu jurisdicciÃ³n.

## License

MIT
