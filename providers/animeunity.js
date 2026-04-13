// ============================================================
// AnimeUnity Provider per NuvioTV
// Sito    : https://www.animeunity.so
// Lingua  : Italiano (Sub ITA / ITA doppiato)
// Formato : HLS m3u8 via Vixcloud
//
// Compatibile con AioMetadata:
//   - ID anime  → Kitsu  (formato "kitsu:12345")
//   - Stagioni/Episodi → numerazione TMDB
// ============================================================

var BASE_URL = "https://www.animeunity.so";

var BROWSER_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Referer": BASE_URL + "/",
  "Origin": BASE_URL,
  "Accept": "application/json, text/plain, */*",
  "Accept-Language": "it-IT,it;q=0.9,en;q=0.8",
  "X-Requested-With": "XMLHttpRequest"
};

// ------------------------------------------------------------------
// ENTRY POINT — chiamato da NuvioTV
//
// Con AioMetadata + Kitsu come fonte primaria:
//   tmdbId    = "kitsu:12345"  (ID Kitsu dell'anime)
//   season    = numero stagione TMDB
//   episode   = numero episodio TMDB
//
// Fallback TMDB:
//   tmdbId    = "12345"  (ID TMDB numerico)
// ------------------------------------------------------------------
function getStreams(tmdbId, mediaType, season, episode) {
  console.log("[AnimeUnity] getStreams → id=" + tmdbId + " type=" + mediaType + " s=" + season + " e=" + episode);

  var kitsuId = extractKitsuId(tmdbId);

  var searchPromise;
  if (kitsuId) {
    console.log("[AnimeUnity] Modalità Kitsu ID: " + kitsuId);
    searchPromise = searchByKitsuId(kitsuId);
  } else {
    console.log("[AnimeUnity] Fallback TMDB ID: " + tmdbId);
    searchPromise = searchByTmdbId(tmdbId, mediaType);
  }

  return searchPromise
    .then(function(animeList) {
      if (!animeList || animeList.length === 0) {
        console.log("[AnimeUnity] Nessun risultato trovato.");
        return [];
      }

      // Recupera stream per ogni variante trovata (Sub ITA + ITA se presenti)
      var promises = animeList.map(function(anime) {
        return fetchStreamsForAnime(anime, mediaType, season, episode);
      });

      return Promise.all(promises).then(function(results) {
        return results.reduce(function(acc, arr) { return acc.concat(arr || []); }, []);
      });
    })
    .catch(function(err) {
      console.error("[AnimeUnity] Errore fatale:", err.message || err);
      return [];
    });
}

// ------------------------------------------------------------------
// Estrae il Kitsu ID numerico dal formato "kitsu:12345"
// Ritorna null se non è un Kitsu ID
// ------------------------------------------------------------------
function extractKitsuId(id) {
  if (!id) return null;
  var str = String(id);
  // Formato AioMetadata: "kitsu:12345" oppure "kitsu:12345:1"
  if (str.indexOf("kitsu:") === 0) {
    var parts = str.split(":");
    return parts[1] || null;
  }
  return null;
}

// ------------------------------------------------------------------
// Cerca su AnimeUnity usando il Kitsu ID
// AnimeUnity espone kitsu_id nella sua API interna
// ------------------------------------------------------------------
function searchByKitsuId(kitsuId) {
  var url = BASE_URL + "/api/anime?kitsu_id=" + kitsuId;
  console.log("[AnimeUnity] Ricerca Kitsu:", url);

  return fetch(url, { headers: BROWSER_HEADERS })
    .then(function(res) {
      if (!res.ok) throw new Error("HTTP " + res.status);
      return res.json();
    })
    .then(function(data) {
      var list = normalizeAnimeList(data);
      if (list.length > 0) return list;
      // AnimeUnity non ha trovato nulla per quell'ID Kitsu:
      // fallback → ottieni il titolo da Kitsu.io e cerca per nome
      console.log("[AnimeUnity] kitsu_id non trovato direttamente, ricerco per titolo...");
      return searchByKitsuTitle(kitsuId);
    })
    .catch(function(err) {
      console.warn("[AnimeUnity] searchByKitsuId fallito:", err.message);
      return searchByKitsuTitle(kitsuId);
    });
}

// ------------------------------------------------------------------
// Recupera il titolo canonico da Kitsu.io e cerca su AnimeUnity per nome
// ------------------------------------------------------------------
function searchByKitsuTitle(kitsuId) {
  var kitsuUrl = "https://kitsu.io/api/edge/anime/" + kitsuId;
  console.log("[AnimeUnity] Recupero titolo da Kitsu:", kitsuUrl);

  return fetch(kitsuUrl, {
    headers: {
      "Accept": "application/vnd.api+json",
      "Content-Type": "application/vnd.api+json"
    }
  })
    .then(function(res) {
      if (!res.ok) throw new Error("Kitsu HTTP " + res.status);
      return res.json();
    })
    .then(function(data) {
      var attrs = data && data.data && data.data.attributes;
      if (!attrs) throw new Error("Risposta Kitsu non valida");

      // Preferisci titolo italiano > traslitterato > inglese > canonico
      var title = (attrs.titles && (attrs.titles.it || attrs.titles.en_jp || attrs.titles.en))
                  || attrs.canonicalTitle
                  || "";

      console.log("[AnimeUnity] Titolo ottenuto da Kitsu: '" + title + "'");
      return searchByTitle(title);
    })
    .catch(function(err) {
      console.error("[AnimeUnity] searchByKitsuTitle fallito:", err.message);
      return [];
    });
}

// ------------------------------------------------------------------
// Fallback: cerca su AnimeUnity usando ID TMDB
// ------------------------------------------------------------------
function searchByTmdbId(tmdbId, mediaType) {
  var type = mediaType === "movie" ? "Movie" : "TV";
  var url = BASE_URL + "/api/anime?tmdb_id=" + tmdbId + "&type=" + type;
  console.log("[AnimeUnity] Ricerca TMDB:", url);

  return fetch(url, { headers: BROWSER_HEADERS })
    .then(function(res) {
      if (!res.ok) throw new Error("HTTP " + res.status);
      return res.json();
    })
    .then(normalizeAnimeList)
    .catch(function(err) {
      console.warn("[AnimeUnity] searchByTmdbId fallito:", err.message);
      return [];
    });
}

// ------------------------------------------------------------------
// Cerca su AnimeUnity per titolo testuale
// ------------------------------------------------------------------
function searchByTitle(title) {
  if (!title) return Promise.resolve([]);
  var url = BASE_URL + "/api/anime?title=" + encodeURIComponent(title);
  console.log("[AnimeUnity] Ricerca per titolo:", url);

  return fetch(url, { headers: BROWSER_HEADERS })
    .then(function(res) {
      if (!res.ok) throw new Error("HTTP " + res.status);
      return res.json();
    })
    .then(normalizeAnimeList)
    .catch(function(err) {
      console.warn("[AnimeUnity] searchByTitle fallito:", err.message);
      return [];
    });
}

// ------------------------------------------------------------------
// Normalizza qualsiasi risposta API in un array di oggetti anime
// ------------------------------------------------------------------
function normalizeAnimeList(data) {
  if (!data) return [];
  if (Array.isArray(data)) return data;
  if (Array.isArray(data.data)) return data.data;
  if (Array.isArray(data.animes)) return data.animes;
  if (data.id) return [data]; // risposta singola
  return [];
}

// ------------------------------------------------------------------
// Recupera gli stream per un anime specifico trovato
// ------------------------------------------------------------------
function fetchStreamsForAnime(anime, mediaType, season, episode) {
  var animeId   = anime.id;
  var animeSlug = anime.slug || String(animeId);
  var title     = anime.title || anime.title_eng || "AnimeUnity";
  var isITA     = title.indexOf("(ITA)") !== -1;
  var label     = "AnimeUnity " + (isITA ? "[ITA]" : "[Sub ITA]");

  console.log("[AnimeUnity] Trovato: '" + title + "' id=" + animeId);

  // Per i film prendi sempre l'episodio 1
  // Per le serie usa la numerazione TMDB dell'episodio
  var targetEp = (mediaType === "movie") ? 1 : (parseInt(episode) || 1);

  return fetchEpisodePage(animeId, animeSlug, targetEp)
    .then(function(episodes) {
      if (!episodes || episodes.length === 0) return [];

      var ep = findEpisode(episodes, targetEp);
      if (!ep) {
        console.warn("[AnimeUnity] Ep " + targetEp + " non trovato.");
        return [];
      }

      return extractStream(ep, label, targetEp, mediaType);
    });
}

// ------------------------------------------------------------------
// Recupera la pagina episodi centrata sul numero richiesto
// AnimeUnity usa i parametri start_range / end_range (inclusivi)
// ------------------------------------------------------------------
function fetchEpisodePage(animeId, animeSlug, targetEp) {
  var start = Math.max(1, targetEp - 5);
  var end   = targetEp + 5;
  var url   = BASE_URL + "/api/anime/" + animeId + "/" + animeSlug
              + "/episodes?start_range=" + start + "&end_range=" + end;

  console.log("[AnimeUnity] Fetch episodi:", url);

  return fetch(url, { headers: BROWSER_HEADERS })
    .then(function(res) {
      if (!res.ok) throw new Error("HTTP " + res.status);
      return res.json();
    })
    .then(function(data) {
      return Array.isArray(data) ? data : (data.episodes || data.data || []);
    })
    .catch(function(err) {
      console.error("[AnimeUnity] fetchEpisodePage errore:", err.message);
      return [];
    });
}

// ------------------------------------------------------------------
// Trova l'episodio con il numero corrispondente (numerazione TMDB)
// ------------------------------------------------------------------
function findEpisode(episodes, targetEp) {
  for (var i = 0; i < episodes.length; i++) {
    if (parseInt(episodes[i].number) === targetEp) return episodes[i];
  }
  return episodes[0] || null; // fallback al primo
}

// ------------------------------------------------------------------
// Fetcha la pagina embed Vixcloud e ne estrae l'URL m3u8
// ------------------------------------------------------------------
function extractStream(episode, label, epNum, mediaType) {
  if (!episode.video_url) {
    console.warn("[AnimeUnity] video_url mancante per ep " + epNum);
    return [];
  }

  var videoUrl = episode.video_url;
  var epLabel  = mediaType === "movie" ? label : label + " Ep." + epNum;

  console.log("[AnimeUnity] Embed URL:", videoUrl);

  return fetch(videoUrl, {
    headers: {
      "User-Agent": BROWSER_HEADERS["User-Agent"],
      "Referer": BASE_URL + "/",
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
    }
  })
    .then(function(res) {
      if (!res.ok) throw new Error("Embed HTTP " + res.status);
      return res.text();
    })
    .then(function(html) {
      return parseM3U8(html, videoUrl, epLabel);
    })
    .catch(function(err) {
      console.error("[AnimeUnity] extractStream errore:", err.message);
      // Se video_url è già un m3u8 diretto, usalo
      if (videoUrl.indexOf(".m3u8") !== -1) {
        return [buildStream(videoUrl, epLabel, { "Referer": BASE_URL + "/" })];
      }
      return [];
    });
}

// ------------------------------------------------------------------
// Analizza l'HTML dell'embed cercando l'URL m3u8 con più pattern
// ------------------------------------------------------------------
function parseM3U8(html, embedUrl, label) {
  var origin = extractOrigin(embedUrl);

  // 1. window.video = { url: "..." }
  var m = html.match(/window\.video\s*=\s*\{[^}]*url\s*:\s*["']([^"']+\.m3u8[^"']*)["']/);
  if (m) return [buildStream(m[1], label, { "Referer": origin + "/" })];

  // 2. "url":"https://...m3u8..."  (JSON embed)
  m = html.match(/"url"\s*:\s*"(https?:\/\/[^"]+\.m3u8[^"]*)"/);
  if (m) return [buildStream(fixSlashes(m[1]), label, { "Referer": origin + "/" })];

  // 3. "file":"https://...m3u8..."
  m = html.match(/"file"\s*:\s*"(https?:\/\/[^"]+\.m3u8[^"]*)"/);
  if (m) return [buildStream(fixSlashes(m[1]), label, { "Referer": origin + "/" })];

  // 4. src="https://...m3u8..."
  m = html.match(/src\s*=\s*["'](https?:\/\/[^"']+\.m3u8[^"']*)["']/);
  if (m) return [buildStream(m[1], label, { "Referer": origin + "/" })];

  // 5. Qualsiasi URL Vixcloud/CDN (cdn AnimeUnity)
  m = html.match(/https?:\/\/(?:vixcloud\.co|cdn\.vixcloud\.co|sc\.vixcloud\.co)[^\s"'<>]+/);
  if (m) return [buildStream(m[0], label, {
    "Referer": "https://vixcloud.co/",
    "Origin": "https://vixcloud.co"
  })];

  // 6. Qualsiasi m3u8 nell'HTML
  m = html.match(/https?:\/\/[^\s"'<>]+\.m3u8[^\s"'<>]*/);
  if (m) return [buildStream(m[0], label, { "Referer": origin + "/" })];

  console.warn("[AnimeUnity] Nessun URL m3u8 trovato nell'embed.");
  return [];
}

// ------------------------------------------------------------------
// Utilities
// ------------------------------------------------------------------
function buildStream(url, title, headers) {
  return {
    name: "AnimeUnity",
    title: title,
    url: url,
    quality: "Auto",
    headers: headers || {}
  };
}

function extractOrigin(url) {
  var m = String(url).match(/^(https?:\/\/[^\/]+)/);
  return m ? m[1] : "https://vixcloud.co";
}

function fixSlashes(str) {
  return str.replace(/\\\//g, "/").replace(/\\u0026/g, "&");
}

module.exports = { getStreams };
