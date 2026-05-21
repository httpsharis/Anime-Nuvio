var __defProp = Object.defineProperty;
var __defProps = Object.defineProperties;
var __getOwnPropDescs = Object.getOwnPropertyDescriptors;
var __getOwnPropSymbols = Object.getOwnPropertySymbols;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __propIsEnum = Object.prototype.propertyIsEnumerable;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __spreadValues = (a, b) => {
  for (var prop in b || (b = {}))
    if (__hasOwnProp.call(b, prop))
      __defNormalProp(a, prop, b[prop]);
  if (__getOwnPropSymbols)
    for (var prop of __getOwnPropSymbols(b)) {
      if (__propIsEnum.call(b, prop))
        __defNormalProp(a, prop, b[prop]);
    }
  return a;
};
var __spreadProps = (a, b) => __defProps(a, __getOwnPropDescs(b));
var __async = (__this, __arguments, generator) => {
  return new Promise((resolve, reject) => {
    var fulfilled = (value) => {
      try {
        step(generator.next(value));
      } catch (e) {
        reject(e);
      }
    };
    var rejected = (value) => {
      try {
        step(generator.throw(value));
      } catch (e) {
        reject(e);
      }
    };
    var step = (x) => x.done ? resolve(x.value) : Promise.resolve(x.value).then(fulfilled, rejected);
    step((generator = generator.apply(__this, __arguments)).next());
  });
};

// src/allwish/index.js
var cheerio = require("cheerio-without-node-native");
var CryptoJS = require("crypto-js");
var PROVIDER_NAME = "AllWish";
var MAIN_URL = "https://all-wish.me";
var TMDB_API_KEY = "439c478a771f35c05022f9feabcca01c";
var REQUEST_TIMEOUT = 12e3;
var EPISODE_LIST_TIMEOUT = 3e4;
var VRF_SECRET = "ysJhV6U27FVIjjuk";
var HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.5",
  "Connection": "keep-alive"
};
var AJAX_HEADERS = {
  "X-Requested-With": "XMLHttpRequest",
  "User-Agent": HEADERS["User-Agent"],
  "Referer": MAIN_URL + "/"
};
function fetchSafe(_0) {
  return __async(this, arguments, function* (url, options = {}, timeout = REQUEST_TIMEOUT) {
    try {
      const signal = typeof AbortSignal !== "undefined" && AbortSignal.timeout ? AbortSignal.timeout(timeout) : null;
      const merged = __spreadProps(__spreadValues({}, options), { headers: __spreadValues(__spreadValues({}, HEADERS), options.headers || {}) });
      if (signal)
        merged.signal = signal;
      const res = yield fetch(url, merged);
      return res;
    } catch (e) {
      console.error("[" + PROVIDER_NAME + "] fetchSafe: " + (url || "").substring(0, 100) + " -> " + e.message);
      return null;
    }
  });
}
function fetchJson(_0) {
  return __async(this, arguments, function* (url, options = {}, timeout) {
    try {
      const res = yield fetchSafe(url, options, timeout);
      if (!res || !res.ok)
        return null;
      return JSON.parse(yield res.text());
    } catch (e) {
      console.error("[" + PROVIDER_NAME + "] fetchJson: " + (url || "").substring(0, 100) + " -> " + e.message);
      return null;
    }
  });
}
function fetchHtml(_0) {
  return __async(this, arguments, function* (url, options = {}) {
    try {
      const res = yield fetchSafe(url, options);
      if (!res || !res.ok)
        return null;
      return cheerio.load(yield res.text());
    } catch (e) {
      console.error("[" + PROVIDER_NAME + "] fetchHtml: " + (url || "").substring(0, 100) + " -> " + e.message);
      return null;
    }
  });
}
function makeStream(name, title, url, quality, headers = {}, subtitles) {
  const stream = {
    name: PROVIDER_NAME + " | " + name,
    title: title || "",
    url: url || "",
    quality: quality || "HD",
    headers: __spreadValues({ "User-Agent": HEADERS["User-Agent"] }, headers || {})
  };
  if (subtitles && Array.isArray(subtitles) && subtitles.length > 0) {
    stream.subtitles = subtitles;
  }
  return stream;
}
function buildStreamLabels(serverType, quality, label, showInfo) {
  const q = quality || "HD";
  const displayName = q + (label ? " " + label : "");
  let titleLine = "";
  if (showInfo && showInfo.title) {
    if (showInfo.mediaType === "tv" && showInfo.season != null && showInfo.episode != null) {
      titleLine = showInfo.title + "\nS" + showInfo.season + " E" + showInfo.episode + " \xB7 " + q + " \xB7 HLS";
    } else {
      titleLine = showInfo.title + "\n" + q + " \xB7 HLS";
    }
  } else {
    titleLine = serverType + (label ? " " + label : "") + "\n" + q + " \xB7 HLS";
  }
  titleLine += "\nby piratezoro9";
  return { name: displayName, title: titleLine };
}
function dedupe(streams) {
  const seen = /* @__PURE__ */ new Set();
  return (streams || []).filter((s) => {
    if (!s || !s.url || seen.has(s.url))
      return false;
    seen.add(s.url);
    return true;
  });
}
function getTMDBInfo(tmdbId, mediaType) {
  return __async(this, null, function* () {
    const idStr = String(tmdbId || "").trim();
    const isImdb = idStr.startsWith("tt");
    const tmdbType = mediaType === "tv" || mediaType === "series" ? "tv" : "movie";
    try {
      if (isImdb) {
        const data = yield fetchJson("https://api.themoviedb.org/3/find/" + idStr + "?api_key=" + TMDB_API_KEY + "&external_source=imdb_id");
        const list = data ? tmdbType === "tv" ? data.tv_results : data.movie_results : null;
        if (list && list.length > 0) {
          const item = list[0];
          return {
            id: item.id,
            title: tmdbType === "tv" ? item.name : item.title,
            originalTitle: tmdbType === "tv" ? item.original_name : item.original_title,
            year: (item.first_air_date || item.release_date || "").split("-")[0],
            genres: item.genre_ids || [],
            imdbId: idStr
          };
        }
        return { id: idStr, title: idStr, originalTitle: idStr, year: null, genres: [], imdbId: idStr };
      } else {
        const data = yield fetchJson("https://api.themoviedb.org/3/" + tmdbType + "/" + idStr + "?api_key=" + TMDB_API_KEY + "&append_to_response=external_ids");
        if (data) {
          return {
            id: data.id,
            title: tmdbType === "tv" ? data.name : data.title,
            originalTitle: tmdbType === "tv" ? data.original_name : data.original_title,
            year: (data.first_air_date || data.release_date || "").split("-")[0],
            genres: (data.genres || []).map((g) => g.id),
            imdbId: data.imdb_id || data.external_ids && data.external_ids.imdb_id || null
          };
        }
      }
    } catch (e) {
      console.error("[" + PROVIDER_NAME + "] TMDB error: " + e.message);
    }
    return { id: idStr, title: idStr, originalTitle: idStr, year: null, genres: [], imdbId: null };
  });
}
function cleanTitle(t) {
  return String(t || "").toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}
function tokenize(t) {
  return cleanTitle(t).split(" ").filter(Boolean);
}
function scoreTitle(resultTitle, queryTitle, queryYear, season) {
  const qTokens = tokenize(queryTitle);
  if (!qTokens.length)
    return 0;
  const rTokens = new Set(tokenize(resultTitle));
  const rLower = cleanTitle(resultTitle);
  const qLower = cleanTitle(queryTitle);
  const rTokenList = tokenize(resultTitle);
  if (rLower === qLower)
    return 1.5;
  const rCleanSuffix = rLower.replace(/\s+tv$/, "").replace(/\s+movie$/, "").replace(/\s+anime$/, "").replace(/\s+specials?$/, "").trim();
  if (rCleanSuffix === qLower)
    return 1.4;
  let matchCount = 0;
  for (const t of qTokens) {
    if (rTokens.has(t))
      matchCount++;
  }
  let score = matchCount / Math.max(qTokens.length, 1);
  if (rLower.startsWith(qLower)) {
    score += 0.3;
    const extraTokens = rTokenList.length - qTokens.length;
    if (extraTokens > 2) {
      score -= Math.min(extraTokens * 0.1, 0.4);
    }
    const qualifierWords = [
      "part",
      "parts",
      "season",
      "movie",
      "movies",
      "special",
      "specials",
      "ova",
      "film",
      "films",
      "the"
    ];
    const extraQualifierCount = rTokenList.slice(qTokens.length).filter((t) => qualifierWords.includes(t)).length;
    if (extraQualifierCount > 0)
      score -= 0.2;
  } else if (qTokens.length <= 4 && matchCount === qTokens.length) {
    score -= 0.4;
  }
  if (queryYear) {
    const yearRegex = /\b(19|20)\d{2}\b/;
    const rYearMatch = rLower.match(yearRegex);
    if (rYearMatch && Math.abs(parseInt(rYearMatch[0]) - parseInt(queryYear)) <= 1) {
      score += 0.5;
    } else if (rYearMatch) {
      const gap = Math.abs(parseInt(rYearMatch[0]) - parseInt(queryYear));
      score -= Math.min(gap * 0.1, 0.8);
    }
  }
  if (season && Number(season) > 1) {
    const sNum = Number(season);
    const hasSeason = rLower.match(
      new RegExp("\\b" + sNum + "(?:st|nd|rd|th)\\s+season|season\\s*" + sNum + "|\\bpart\\s*" + sNum, "i")
    );
    if (hasSeason) {
      score += 0.4;
    } else {
      const mentionsAnySeason = rLower.match(/\b(?:season|part)\s*\d+/i);
      if (!mentionsAnySeason) {
        score -= 0.3;
      }
    }
  }
  return Math.min(score, 2);
}
function searchAllWish(title, originalTitle, year, season) {
  return __async(this, null, function* () {
    try {
      const queries = [];
      if (title)
        queries.push(title);
      if (originalTitle && originalTitle !== title)
        queries.push(originalTitle);
      if (season && Number(season) > 1) {
        const sNum = Number(season);
        if (title) {
          queries.push(title + " " + sNum);
          queries.push(title + " season " + sNum);
        }
      }
      const results = [];
      for (const q of queries) {
        const $ = yield fetchHtml(MAIN_URL + "/filter?keyword=" + encodeURIComponent(q) + "&page=1");
        if (!$)
          continue;
        $("div.item").each((i, el) => {
          const itemTitle = $(el).find("div.name > a").text().trim();
          const href = $(el).find("div.name > a").attr("href");
          if (itemTitle && href) {
            const watchUrl = href.replace(/\/ep-\d+\/?$/i, "");
            results.push({
              title: itemTitle,
              watchUrl,
              query: q
            });
          }
        });
        if (results.length > 0)
          break;
      }
      if (results.length === 0)
        return null;
      let best = null;
      let bestScore = -1;
      for (const r of results) {
        const s1 = scoreTitle(r.title, title || "", year || null, season);
        const s2 = originalTitle ? scoreTitle(r.title, originalTitle, year || null, season) : 0;
        const score = Math.max(s1, s2);
        if (score > bestScore) {
          bestScore = score;
          best = r;
        }
      }
      if (bestScore < 0.3) {
        console.log("[" + PROVIDER_NAME + "] Title match score too low: " + bestScore);
        return null;
      }
      console.log("[" + PROVIDER_NAME + '] Best match: "' + best.title + '" score=' + bestScore.toFixed(2));
      return best;
    } catch (e) {
      console.error("[" + PROVIDER_NAME + "] Search error: " + e.message);
      return null;
    }
  });
}
function generateEpisodeVrf(episodeId) {
  const encodedId = encodeURIComponent(episodeId).replace(/%21/g, "!").replace(/%27/g, "'").replace(/%28/g, "(").replace(/%29/g, ")").replace(/%7E/g, "~").replace(/%2A/g, "*").replace(/%20/g, "%20");
  const keyCodes = Array.from(VRF_SECRET).map((ch) => ch.charCodeAt(0));
  const dataCodes = Array.from(encodedId).map((ch) => ch.charCodeAt(0));
  const n = Array.from({ length: 256 }, (_, i) => i);
  let a = 0;
  for (let o2 = 0; o2 <= 255; o2++) {
    a = (a + n[o2] + keyCodes[o2 % keyCodes.length]) % 256;
    [n[o2], n[a]] = [n[a], n[o2]];
  }
  const out = [];
  let o = 0;
  a = 0;
  for (let r = 0; r < dataCodes.length; r++) {
    o = (o + 1) % 256;
    a = (a + n[o]) % 256;
    [n[o], n[a]] = [n[a], n[o]];
    const k = n[(n[o] + n[a]) % 256];
    out.push((dataCodes[r] ^ k) & 255);
  }
  function bytesToB64(bytes) {
    let binary = "";
    for (const b of bytes)
      binary += String.fromCharCode(b);
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }
  const base1 = bytesToB64(out);
  const transform = { 0: -3, 1: 3, 2: -4, 3: 2, 4: -2, 5: 5, 6: 4, 7: 5 };
  const step2 = Array.from(base1).map((ch, i) => {
    let s = ch.charCodeAt(0);
    s += transform[i % 8] || 0;
    return s & 255;
  });
  const base2 = bytesToB64(step2);
  const rot13 = (c) => {
    if (c >= "A" && c <= "Z")
      return String.fromCharCode((c.charCodeAt(0) - 65 + 13) % 26 + 65);
    if (c >= "a" && c <= "z")
      return String.fromCharCode((c.charCodeAt(0) - 97 + 13) % 26 + 97);
    return c;
  };
  return Array.from(base2).map(rot13).join("");
}
function chooseEpisode($ep, season, episode, mediaType) {
  const entries = $ep("div.range > div > a").map((i, el) => ({
    slug: parseInt($ep(el).attr("data-slug") || "0", 10),
    ids: $ep(el).attr("data-ids") || "",
    hasSub: $ep(el).attr("data-sub") === "1",
    hasDub: $ep(el).attr("data-dub") === "1",
    malId: $ep(el).attr("data-mal") ? parseInt($ep(el).attr("data-mal"), 10) : null
  })).get().filter((e) => e.ids);
  if (!entries.length)
    return null;
  if (mediaType === "movie" || episode == null)
    return entries[0];
  const epNum = Number(episode);
  return entries.find((e) => e.slug === epNum) || null;
}
function extractMegaPlay(url, label, showInfo) {
  return __async(this, null, function* () {
    try {
      const pageHtml = yield fetchSafe(url, {
        headers: __spreadProps(__spreadValues({}, HEADERS), { "X-Requested-With": "XMLHttpRequest", "Referer": "https://megaplay.buzz/" })
      });
      if (!pageHtml)
        return [];
      const $ = cheerio.load(yield pageHtml.text());
      const id = $("#megaplay-player").attr("data-id");
      if (!id)
        return [];
      const src = yield fetchJson("https://megaplay.buzz/stream/getSources?id=" + id + "&id=" + id, {
        headers: __spreadProps(__spreadValues({}, HEADERS), { "X-Requested-With": "XMLHttpRequest", "Referer": "https://megaplay.buzz/" })
      });
      if (!src || !src.sources || !src.sources.file)
        return [];
      const subtitles = (src.tracks || []).filter((t) => t.kind === "captions" || t.kind === "subtitles").map((t) => ({ label: t.label || "Unknown", url: t.file })).filter((t) => t.url);
      const labels = buildStreamLabels("MegaPlay", "1080p", label, showInfo);
      return [makeStream(
        labels.name,
        labels.title,
        src.sources.file,
        "1080p",
        {
          "Referer": "https://megaplay.buzz/",
          "Origin": "https://megaplay.buzz",
          "User-Agent": HEADERS["User-Agent"]
        },
        subtitles.length > 0 ? subtitles : void 0
      )];
    } catch (e) {
      console.error("[" + PROVIDER_NAME + "] MegaPlay error: " + e.message);
      return [];
    }
  });
}
function extractZen(url, label, showInfo) {
  return __async(this, null, function* () {
    try {
      const res = yield fetchSafe(url, { headers: HEADERS });
      if (!res)
        return [];
      const html = yield res.text();
      const scriptMatch = html.match(/video_b64:\s*"([^"]+)"/);
      const keyMatch = html.match(/enc_key_b64:\s*"([^"]+)"/);
      const ivMatch = html.match(/iv_b64:\s*"([^"]+)"/);
      const subMatch = html.match(/subtitles:\s*"([^"]*)"/);
      if (!scriptMatch || !keyMatch || !ivMatch)
        return [];
      const videoB64 = scriptMatch[1];
      const keyB64 = keyMatch[1];
      const ivB64 = ivMatch[1];
      const key = CryptoJS.enc.Base64.parse(keyB64);
      const iv = CryptoJS.enc.Base64.parse(ivB64);
      const encrypted = CryptoJS.enc.Base64.parse(videoB64);
      const decrypted = CryptoJS.AES.decrypt(
        { ciphertext: encrypted },
        key,
        { iv, mode: CryptoJS.mode.CBC, padding: CryptoJS.pad.Pkcs7 }
      );
      const videoUrl = decrypted.toString(CryptoJS.enc.Utf8);
      if (!videoUrl)
        return [];
      let subtitles = [];
      if (subMatch && subMatch[1]) {
        try {
          const rawSubs = subMatch[1].replace(/\\"/g, '"').replace(/\\\\\//g, "/").replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
          const parsed = JSON.parse(rawSubs);
          if (Array.isArray(parsed)) {
            subtitles = parsed.filter((s) => s.url).map((s) => ({ label: s.language || "Unknown", url: s.url }));
          }
        } catch (e) {
        }
      }
      const labels = buildStreamLabels("Zen", "1080p", label, showInfo);
      return [makeStream(
        labels.name,
        labels.title,
        videoUrl.trim(),
        "1080p",
        {
          "Referer": "https://player.sgsgsgsr.site/",
          "Origin": "https://player.sgsgsgsr.site/"
        },
        subtitles.length > 0 ? subtitles : void 0
      )];
    } catch (e) {
      console.error("[" + PROVIDER_NAME + "] Zen error: " + e.message);
      return [];
    }
  });
}
function resolveServers(ids, allowedTypes, showInfo) {
  return __async(this, null, function* () {
    try {
      const serverList = yield fetchJson(MAIN_URL + "/ajax/server/list?servers=" + encodeURIComponent(ids), {
        headers: AJAX_HEADERS
      });
      if (!serverList || serverList.status !== 200)
        return [];
      const $ = cheerio.load(serverList.result || "");
      const streams = [];
      $("div.server-type").each((i, section) => {
        const sectionType = $(section).attr("data-type");
        const isHardSub = ($(section).find("span").first().text() || "").includes("H-Sub");
        if (!allowedTypes.includes(sectionType))
          return;
        $(section).find("div.server-list > div.server").each((j, server) => {
          const dataId = $(server).attr("data-link-id");
          if (!dataId)
            return;
          streams.push({ dataId, sectionType, isHardSub });
        });
      });
      if (streams.length === 0)
        return [];
      const results = yield Promise.all(streams.map((s) => __async(this, null, function* () {
        try {
          const apiRes = yield fetchJson(MAIN_URL + "/ajax/server?get=" + encodeURIComponent(s.dataId), {
            headers: AJAX_HEADERS
          });
          if (!apiRes || !apiRes.result || !apiRes.result.url)
            return [];
          const realUrl = apiRes.result.url;
          const label = s.sectionType === "dub" ? "[Dub]" : s.isHardSub ? "[Hard Sub]" : "[Sub]";
          if (/megaplay\.buzz/i.test(realUrl)) {
            return extractMegaPlay(realUrl, label, showInfo);
          } else if (/player\.sgsgsgsr\.site|zencloudz\.cc/i.test(realUrl)) {
            return extractZen(realUrl, label, showInfo);
          } else if (/vidwish\.live/i.test(realUrl)) {
            return extractMegaPlay(realUrl, label, showInfo);
          }
          return [];
        } catch (e) {
          return [];
        }
      })));
      return dedupe(results.flat());
    } catch (e) {
      console.error("[" + PROVIDER_NAME + "] Server resolve error: " + e.message);
      return [];
    }
  });
}
function getStreams(tmdbId, mediaType, season, episode) {
  return __async(this, null, function* () {
    try {
      console.log("[" + PROVIDER_NAME + "] Request: ID=" + tmdbId + " Type=" + mediaType + " S=" + season + " E=" + episode);
      if (mediaType !== "tv" && mediaType !== "movie")
        return [];
      const info = yield getTMDBInfo(tmdbId, mediaType);
      if (!info || !info.title) {
        console.log("[" + PROVIDER_NAME + "] No TMDB data");
        return [];
      }
      console.log("[" + PROVIDER_NAME + '] Resolved: "' + info.title + '" (' + (info.year || "N/A") + ")");
      if (info.genres && info.genres.length > 0 && !info.genres.includes(16)) {
        console.log("[" + PROVIDER_NAME + "] Not anime (genres: " + info.genres.join(",") + "), rejecting");
        return [];
      }
      const match = yield searchAllWish(info.title, info.originalTitle, info.year, season);
      if (!match || !match.watchUrl) {
        console.log("[" + PROVIDER_NAME + "] No match on AllWish");
        return [];
      }
      const detailHtml = yield fetchHtml(match.watchUrl);
      if (!detailHtml)
        return [];
      const showId = detailHtml("main > div.container").attr("data-id");
      if (!showId) {
        console.log("[" + PROVIDER_NAME + "] No show ID found");
        return [];
      }
      const vrf = generateEpisodeVrf(showId);
      const epList = yield fetchJson(MAIN_URL + "/ajax/episode/list/" + showId + "?vrf=" + encodeURIComponent(vrf), {
        headers: AJAX_HEADERS
      }, EPISODE_LIST_TIMEOUT);
      if (!epList || epList.status !== 200) {
        console.log("[" + PROVIDER_NAME + "] Episode list failed");
        return [];
      }
      const $ep = cheerio.load(epList.result || "");
      const safeEp = episode != null ? Number(episode) : null;
      const selected = chooseEpisode($ep, season, safeEp, mediaType);
      if (!selected) {
        console.log("[" + PROVIDER_NAME + "] Episode not found (looking for ep " + safeEp + ")");
        return [];
      }
      console.log("[" + PROVIDER_NAME + "] Selected episode slug=" + selected.slug + " ids=" + selected.ids.substring(0, 30) + "...");
      const allowed = [];
      if (selected.hasSub)
        allowed.push("sub");
      if (selected.hasDub)
        allowed.push("dub");
      if (allowed.length === 0)
        return [];
      const showInfo = { title: info.title, season, episode, mediaType };
      const streams = yield resolveServers(selected.ids, allowed, showInfo);
      console.log("[" + PROVIDER_NAME + "] Returning " + streams.length + " streams");
      const qualityOrder = { "2160p": 5, "4k": 5, "1080p": 3, "720p": 2, "HD": 1, "480p": 1, "360p": 0 };
      return streams.sort((a, b) => (qualityOrder[b.quality] || 0) - (qualityOrder[a.quality] || 0));
    } catch (e) {
      console.error("[" + PROVIDER_NAME + "] Fatal: " + e.message);
      return [];
    }
  });
}
if (typeof module !== "undefined" && module.exports) {
  module.exports = { getStreams };
} else {
  global.getStreams = getStreams;
}
