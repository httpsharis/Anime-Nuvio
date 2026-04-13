var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var __async = (__this, __arguments, generator) => {
  return new Promise((resolve, reject) => {
    var fulfilled = (value) => {
      try { step(generator.next(value)); } catch (e) { reject(e); }
    };
    var rejected = (value) => {
      try { step(generator.throw(value)); } catch (e) { reject(e); }
    };
    var step = (x) => x.done ? resolve(x.value) : Promise.resolve(x.value).then(fulfilled, rejected);
    step((generator = generator.apply(__this, __arguments)).next());
  });
};

var animeav1_exports = {};
__export(animeav1_exports, { getStreams: () => getStreams });
module.exports = __toCommonJS(animeav1_exports);

var TMDB_API_KEY = "439c478a771f35c05022f9feabcca01c";
var BASE = "https://animeav1.com";
var UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
var HEADERS = {
  "User-Agent": UA,
  "Accept": "text/html,application/xhtml+xml,*/*;q=0.9",
  "Accept-Language": "es-AR,es;q=0.9",
  "Referer": BASE
};

function buildSlug(title) {
  return title
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function getTmdbTitle(tmdbId, mediaType) {
  return __async(this, null, function* () {
    const langs = [
      { lang: "es-419", label: "Latino" },
      { lang: "es-ES", label: "España" },
      { lang: "en-US", label: "Inglés" }
    ];
    for (const { lang, label } of langs) {
      try {
        const url = `https://api.themoviedb.org/3/${mediaType}/${tmdbId}?api_key=${TMDB_API_KEY}&language=${lang}`;
        const data = yield fetch(url).then((r) => r.json());
        const title = mediaType === "movie" ? data.title : data.name;
        const original = mediaType === "movie" ? data.original_title : data.original_name;
        if (title) {
          console.log(`[AnimeAV1] TMDB (${label}): "${title}" / original: "${original}"`);
          return { title, original };
        }
      } catch (e) {
        console.log(`[AnimeAV1] Error TMDB ${label}: ${e.message}`);
      }
    }
    return null;
  });
}

function findMediaSlug(title, original) {
  return __async(this, null, function* () {
    // Construye candidatos de slugs a probar
    const slugs = [];
    if (title) slugs.push(buildSlug(title));
    if (original && original !== title) slugs.push(buildSlug(original));

    for (const slug of slugs) {
      const url = `${BASE}/media/${slug}`;
      try {
        const res = yield fetch(url, { headers: HEADERS });
        const html = yield res.text();
        if (res.status === 200 && html.includes("episodio") || html.includes("episode")) {
          console.log(`[AnimeAV1] ✓ Encontrado: /media/${slug}`);
          return { slug, html };
        }
      } catch (e) {
        console.log(`[AnimeAV1] Error slug "${slug}": ${e.message}`);
      }
    }

    // Búsqueda en el catálogo como fallback
    try {
      const searchSlug = slugs[0] || "";
      const searchUrl = `${BASE}/catalogo?buscar=${encodeURIComponent(searchSlug.replace(/-/g, " "))}`;
      const html = yield fetch(searchUrl, { headers: HEADERS }).then((r) => r.text());
      const re = /href="\/media\/([a-z0-9\-]+)"/i;
      const m = re.exec(html);
      if (m) {
        const found = m[1];
        console.log(`[AnimeAV1] ✓ Encontrado por búsqueda: /media/${found}`);
        const pageHtml = yield fetch(`${BASE}/media/${found}`, { headers: HEADERS }).then((r) => r.text());
        return { slug: found, html: pageHtml };
      }
    } catch (e) {
      console.log(`[AnimeAV1] Error búsqueda catálogo: ${e.message}`);
    }

    console.log("[AnimeAV1] No se encontró slug");
    return null;
  });
}

function getEpisodeStreams(slug, season, episode) {
  return __async(this, null, function* () {
    // AnimeAV1 usa /media/slug/episodio/N o /media/slug?ep=N según el sitio
    const attempts = [
      `${BASE}/media/${slug}/episodio/${episode}`,
      `${BASE}/media/${slug}/episode/${episode}`,
      `${BASE}/media/${slug}?ep=${episode}`,
      `${BASE}/media/${slug}/temporada/${season}/episodio/${episode}`
    ];

    for (const url of attempts) {
      try {
        const res = yield fetch(url, { headers: HEADERS });
        if (res.status !== 200) continue;
        const html = yield res.text();

        const streams = extractStreams(html, url);
        if (streams.length > 0) {
          console.log(`[AnimeAV1] ✓ ${streams.length} streams desde: ${url}`);
          return streams;
        }
      } catch (e) {
        console.log(`[AnimeAV1] Error ${url}: ${e.message}`);
      }
    }
    return [];
  });
}

function extractStreams(html, referer) {
  const streams = [];
  const seen = {};

  // M3U8 directo
  const r1 = /["'](https?:\/\/[^"'\s<>]+\.m3u8[^"'\s<>]*)/g;
  let m;
  while ((m = r1.exec(html)) !== null) {
    if (!seen[m[1]]) {
      seen[m[1]] = true;
      streams.push({
        name: "AnimeAV1",
        title: "HLS \xB7 Sub Espa\xF1ol",
        url: m[1],
        quality: "Auto",
        headers: { "Referer": referer || BASE, "User-Agent": UA }
      });
    }
  }

  // MP4 directo
  const r2 = /["'](https?:\/\/[^"'\s<>]+\.mp4[^"'\s<>]*)/g;
  while ((m = r2.exec(html)) !== null) {
    if (!seen[m[1]]) {
      seen[m[1]] = true;
      streams.push({
        name: "AnimeAV1",
        title: "MP4 \xB7 Sub Espa\xF1ol",
        url: m[1],
        quality: "Auto"
      });
    }
  }

  // Iframes / embeds
  const embedHosts = [
    "streamwish", "doodstream", "vidhide", "filemoon",
    "yourupload", "mixdrop", "upstream", "fembed",
    "ok.ru", "voe.sx", "fastream", "streamlare", "mp4upload"
  ];
  const r3 = /(?:src|data-src)=["'](https?:\/\/[^"'\s<>]+)/gi;
  while ((m = r3.exec(html)) !== null) {
    const url = m[1];
    for (const host of embedHosts) {
      if (url.includes(host) && !seen[url]) {
        seen[url] = true;
        streams.push({
          name: "AnimeAV1",
          title: `${host} \xB7 Sub Espa\xF1ol`,
          url,
          quality: "Auto"
        });
        break;
      }
    }
  }

  return streams;
}

function getStreams(tmdbId, mediaType, season, episode) {
  return __async(this, null, function* () {
    if (!tmdbId || !mediaType) return [];

    const ep = episode || 1;
    const s = season || 1;
    console.log(`[AnimeAV1] TMDB ${tmdbId} (${mediaType}) S${s}E${ep}`);

    try {
      const tmdbInfo = yield getTmdbTitle(tmdbId, mediaType);
      if (!tmdbInfo) return [];

      const found = yield findMediaSlug(tmdbInfo.title, tmdbInfo.original);
      if (!found) return [];

      let streams = [];

      if (mediaType === "tv") {
        streams = yield getEpisodeStreams(found.slug, s, ep);
        // Si no encontró desde la URL de episodio, intenta extraer directo de la página del anime
        if (streams.length === 0) {
          streams = extractStreams(found.html, `${BASE}/media/${found.slug}`);
        }
      } else {
        streams = extractStreams(found.html, `${BASE}/media/${found.slug}`);
      }

      console.log(`[AnimeAV1] ✓ ${streams.length} streams totales`);
      return streams;
    } catch (e) {
      console.log(`[AnimeAV1] Error: ${e.message}`);
      return [];
    }
  });
}
