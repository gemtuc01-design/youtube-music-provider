// ===== YouTube Music Provider =====

const YTM_HOST = "https://music.youtube.com";
const YTM_BASE = `${YTM_HOST}/youtubei/v1`;

const settings = {
  debug: true,
  region: "AR"
};

// -------------------------------------------------------------
// Lifecycle
// -------------------------------------------------------------
function initialize() {
  if (settings.debug) console.log("[ytmusic] initialized, region:", settings.region);
  return { success: true };
}

function cleanup() {
  return { success: true };
}

// -------------------------------------------------------------
// Auto-config (InnerTube ytcfg) - scrapeada y cacheada 24h
// -------------------------------------------------------------
function getYtcfg() {
  let cached = storage.get("ytcfg");
  if (cached) {
    const c = JSON.parse(cached);
    if (Date.now() - (c.ts || 0) < 86400000 && c.key && c.clientVersion) return c;
  }

  const html = http.get(`${YTM_HOST}/`).body;
  const key = (html.match(/"INNERTUBE_API_KEY":"([^"]+)"/) || [])[1];
  const ver = (html.match(/"INNERTUBE_CLIENT_VERSION":"([^"]+)"/) || [])[1];

  if (!key || !ver) {
    if (settings.debug) console.log("[ytmusic] no pude scrapear ytcfg");
    return { key: null, clientVersion: "1.20240715.01.00" };
  }

  const cfg = { key: key, clientVersion: ver, ts: Date.now() };
  storage.set("ytcfg", JSON.stringify(cfg));
  if (settings.debug) console.log("[ytmusic] ytcfg ok", ver);
  return cfg;
}

function ytmContext(cfg) {
  return {
    client: {
      clientName: "WEB_REMIX",
      clientVersion: cfg.clientVersion,
      hl: "es",
      gl: settings.region || "AR"
    }
  };
}

// -------------------------------------------------------------
// SEARCH (barra de búsqueda custom) - CON DEBUG EN RESULTADOS
// -------------------------------------------------------------
function customSearch(query, options) {
  const cfg = getYtcfg();
  const url = cfg.key
    ? `${YTM_BASE}/search?key=${cfg.key}&prettyPrint=false`
    : `${YTM_BASE}/search?prettyPrint=false`; // InnerTube banca sin key

  const res = http.post(url, {
    headers: {
      "Content-Type": "application/json",
      "Origin": YTM_HOST,
      "Referer": `${YTM_HOST}/`,
      "X-YouTube-Client-Name": "67",
      "X-YouTube-Client-Version": cfg.clientVersion
    },
    body: JSON.stringify({
      context: ytmContext(cfg),
      query: query,
      params: "EgWKAQIIAWoKEAkQBRAKEAMQBA%3D%3D" // filtro Songs
    })
  });

  // 1. Si YouTube rechaza la conexión, mostramos el código HTTP
  if (res.status !== 200) {
    storage.remove("ytcfg"); // limpiá cache para reintentar limpio
    return [{
      id: "error_http",
      name: "Error HTTP de YouTube: " + res.status,
      artists: "Intenta buscar de nuevo (caché limpiado)",
      album_name: "",
      duration_ms: 0,
      cover_url: "",
      item_type: "track"
    }];
  }

  // 2. Si la conexión es exitosa pero falla al leer los datos de YouTube
  try {
    const data = JSON.parse(res.body);
    const results = extractSearchItems(data).map(parseSongItem).filter(Boolean);
    
    // 3. Si YouTube no devolvió error, pero nuestra función no encontró canciones
    if (results.length === 0) {
       return [{
          id: "error_empty",
          name: "Resultados vacíos",
          artists: "¿YouTube cambió el diseño HTML?",
          album_name: "",
          duration_ms: 0,
          cover_url: "",
          item_type: "track"
       }];
    }
    
    return results;
  } catch (e) {
    return [{
      id: "error_parse",
      name: "Error en el código: " + String(e.message),
      artists: "Revisa extractSearchItems",
      album_name: "",
      duration_ms: 0,
      cover_url: "",
      item_type: "track"
    }];
  }
}

// --- navegar la respuesta (banca musicShelf e itemSection) ---
function extractSearchItems(data) {
  const tabs = data?.contents?.tabbedSearchResultsRenderer?.tabs || [];
  const sectionList =
    tabs[0]?.tabRenderer?.content?.sectionListRenderer?.contents || [];

  let out = [];
  for (const section of sectionList) {
    const shelf =
      section.musicShelfRenderer ||   // formato viejo
      section.itemSectionRenderer;    // formato nuevo
    const contents = shelf?.contents || [];
    for (const c of contents) {
      const item = c.musicResponsiveListItemRenderer;
      if (item) out.push(item);
    }
  }
  return out;
}

// --- mapear un MusicResponsiveListItemRenderer a track de SpotiFLAC ---
function parseSongItem(item) {
  const videoId = extractVideoId(item);
  if (!videoId) return null;

  const cols = item.flexColumns || [];
  const title = runText(cols[0]?.musicResponsiveListItemFlexColumnRenderer?.text);
  const meta = runsArray(cols[1]?.musicResponsiveListItemFlexColumnRenderer?.text);

  const artist = meta.filter(r => !isSeparator(r) && !isDuration(r.text))[0]?.text || "";
  const durText = meta.map(r => r.text).find(isDuration) || "0:00";
  const thumbs =
    item.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails || [];

  return {
    id: videoId,
    name: title,
    artists: artist,
    album_name: "",
    duration_ms: mmssToMs(durText),
    cover_url: thumbs.length ? thumbs[thumbs.length - 1].url : "",
    item_type: "track"
  };
}

// -------------------------------------------------------------
// URL HANDLER (cuando pegan un link de YT)
// -------------------------------------------------------------
function handleURL(url) {
  const videoId = extractVideoIdFromUrl(url);
  if (!videoId) return { success: false, error: "URL no soportada" };

  const t = fetchTrack(videoId);
  return {
    success: true,
    type: "track",
    track: {
      id: t.id,
      name: t.title,
      artists: t.artist,
      album_name: t.album || "Unknown Album",
      duration_ms: t.duration * 1000,
      images: t.thumbnail
    }
  };
}

// -------------------------------------------------------------
// DOWNLOAD
// -------------------------------------------------------------
function download(trackId, quality, outputPath, progressCallback) {
  try {
    const streamUrl = resolveStream(trackId, quality);
    const ok = file.download(streamUrl, outputPath, progressCallback);
    if (!ok) return { success: false, error: "Descarga falló", error_type: "download_error" };
    return { success: true, path: outputPath };
  } catch (e) {
    if (settings.debug) console.log("[ytmusic] download error:", String(e));
    return { success: false, error: String(e), error_type: "network_error" };
  }
}

// -------------------------------------------------------------
// resolveStream (cliente ANDROID_MUSIC = URLs directas, sin signatureCipher)
// -------------------------------------------------------------

// itags de audio-only comunes en YT:
//  251 = opus ~160kbps (webm) | 140 = m4a AAC 128kbps | 250 = opus ~70k | 249 = opus ~50k
const QUALITY_ITAGS = {
  OPUS_160: [251, 250, 249, 140],
  MP3_320:  [140, 251, 250, 249]  // no hay mp3 nativo; bajamos m4a y la app transcodifica
};

function androidContext() {
  return {
    client: {
      clientName: "ANDROID_MUSIC",
      clientVersion: "6.42.52",      // versión app YT Music Android (caduca, subir si da 403)
      androidSdkVersion: 33,
      hl: "es",
      gl: settings.region || "AR"
    }
  };
}

// --- llamada compartida al player endpoint (ANDROID_MUSIC) ---
function callPlayer(videoId) {
  const cfg = getYtcfg();
  const url = cfg.key
    ? `${YTM_BASE}/player?key=${cfg.key}&prettyPrint=false`
    : `${YTM_BASE}/player?prettyPrint=false`;

  const res = http.post(url, {
    headers: {
      "Content-Type": "application/json",
      "User-Agent": "com.google.android.apps.youtube.music/6.42.52 (Linux; U; Android 13)",
      "X-YouTube-Client-Name": "21",      // 21 = ANDROID_MUSIC
      "X-YouTube-Client-Version": "6.42.52"
    },
    body: JSON.stringify({
      context: androidContext(),
      videoId: videoId,
      contentCheckOk: true,
      racyCheckOk: true
    })
  });

  if (res.status !== 200) throw new Error("player HTTP " + res.status);

  const data = JSON.parse(res.body);
  const st = data?.playabilityStatus?.status;
  if (st && st !== "OK") {
    throw new Error("no reproducible: " + st + " " + (data.playabilityStatus.reason || ""));
  }
  return data;
}

function resolveStream(trackId, quality) {
  const data = callPlayer(trackId);

  const formats = data?.streamingData?.adaptiveFormats || [];
  const audio = formats.filter(f => (f.mimeType || "").startsWith("audio/"));
  if (!audio.length) throw new Error("sin formatos de audio");

  const wanted = QUALITY_ITAGS[quality] || QUALITY_ITAGS.OPUS_160;
  let chosen = null;
  for (const itag of wanted) {
    chosen = audio.find(f => f.itag === itag);
    if (chosen) break;
  }
  if (!chosen) {
    chosen = audio.sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0))[0];
  }

  // ANDROID_MUSIC devuelve .url directa (sin signatureCipher)
  if (!chosen.url) throw new Error("formato sin URL directa (posible signatureCipher)");

  if (settings.debug) console.log("[ytmusic] itag", chosen.itag, chosen.mimeType, chosen.bitrate);
  return chosen.url;
}

// -------------------------------------------------------------
// Helpers
// -------------------------------------------------------------
function extractVideoId(item) {
  return (
    item.playlistItemData?.videoId ||
    item.flexColumns?.[0]?.musicResponsiveListItemFlexColumnRenderer?.text
      ?.runs?.[0]?.navigationEndpoint?.watchEndpoint?.videoId ||
    item.overlay?.musicItemThumbnailOverlayRenderer?.content
      ?.musicPlayButtonRenderer?.playNavigationEndpoint?.watchEndpoint?.videoId ||
    null
  );
}
function extractVideoIdFromUrl(url) {
  const m = url.match(/[?&]v=([^&]+)/) || url.match(/youtu\.be\/([^?&]+)/);
  return m ? m[1] : null;
}
function runText(text) { return text?.runs?.[0]?.text || ""; }
function runsArray(text) { return text?.runs || []; }
function isSeparator(run) { return run.text === " • "; }
function isDuration(s) { return /^\d+:\d{2}$/.test(s || ""); }
function mmssToMs(s) {
  const p = s.split(":").map(Number);
  const sec = p.length === 3 ? p[0]*3600 + p[1]*60 + p[2] : p[0]*60 + p[1];
  return sec * 1000;
}

// --- stubs a completar ---
function fetchTrack(videoId) {
  const data = callPlayer(videoId);
  const vd = data?.videoDetails || {};
  const thumbs = vd.thumbnail?.thumbnails || [];

  return {
    id: vd.videoId || videoId,
    title: vd.title || "Unknown",
    artist: vd.author || "",        // en YT Music suele ser el canal/artista
    album: "",                       // el player endpoint no trae álbum; enriquecer aparte si hace falta
    duration: parseInt(vd.lengthSeconds || "0", 10),
    thumbnail: thumbs.length ? thumbs[thumbs.length - 1].url : ""
  };
}

// -------------------------------------------------------------
// Registro
// -------------------------------------------------------------
registerExtension({
  initialize: initialize,
  cleanup: cleanup,
  customSearch: customSearch,
  handleURL: handleURL,
  download: download
});
