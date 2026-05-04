/**
 * AnimesDigital - Nuvio Provider
 *
 * Scrapes animesdigital.org — Brazilian anime catalog that serves direct HLS
 * playlists (no iframe aggregator, no Cloudflare challenge, no packer).
 *
 * Flow:
 *   1) TMDB lookup + anime gate (original_language=ja or origin_country=JP).
 *   2) Search /?s=<query>, keep /anime/a/<slug> results that strict-match title.
 *   3) Fetch anime page, parse the episode list (<a href="/video/a/<id>/">)
 *      + the "Episódio <N>" label next to each link, pick the requested ep.
 *      For movies, the only link IS the stream.
 *   4) Fetch /video/a/<id>/, extract <iframe src="…/videohls.php?d=<m3u8>…">
 *      or any direct .m3u8/.mp4 on the page, return as a stream.
 *
 * IMPORTANT: like animefire.js, this provider ONLY runs for anime (or JP
 * origin) content. For non-anime titles it returns an empty list so random
 * anime with overlapping keywords never reach the player.
 *
 * Hermes-safe (generator + __async helper, no async/await).
 */
"use strict";

var TMDB_API_KEY = "68e094699525b18a70bab2f86b1fa706";
var BASE_URL = "https://animesdigital.org";
var PROVIDER_TAG = "AnimesDigital";
var USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36";

// ─────────────────────────────────────────────
// Async helper (Hermes-safe generator runner)
// ─────────────────────────────────────────────
var __async = function (__this, __arguments, generator) {
  return new Promise(function (resolve, reject) {
    var fulfilled = function (v) {
      try { step(generator.next(v)); } catch (e) { reject(e); }
    };
    var rejected = function (v) {
      try { step(generator.throw(v)); } catch (e) { reject(e); }
    };
    var step = function (x) {
      return x.done
        ? resolve(x.value)
        : Promise.resolve(x.value).then(fulfilled, rejected);
    };
    step((generator = generator.apply(__this, __arguments)).next());
  });
};

// ─────────────────────────────────────────────
// HTTP helpers
// ─────────────────────────────────────────────
function fetchText(url, opts) {
  if (!opts) opts = {};
  return __async(this, null, function* () {
    try {
      var r = yield fetch(url, {
        method: opts.method || "GET",
        headers: Object.assign(
          {
            "User-Agent": USER_AGENT,
            Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "pt-BR,pt;q=0.9",
          },
          opts.headers || {}
        ),
      });
      return { status: r.status, text: yield r.text() };
    } catch (e) {
      return { status: -1, text: "" };
    }
  });
}

function fetchJson(url, opts) {
  if (!opts) opts = {};
  return __async(this, null, function* () {
    try {
      var r = yield fetch(url, {
        method: opts.method || "GET",
        headers: Object.assign(
          {
            "User-Agent": USER_AGENT,
            Accept: "application/json, */*",
            "Accept-Language": "pt-BR,pt;q=0.9",
          },
          opts.headers || {}
        ),
      });
      var t = yield r.text();
      try { return { status: r.status, data: JSON.parse(t) }; }
      catch (e) { return { status: r.status, data: null, raw: t }; }
    } catch (e) {
      return { status: -1, data: null };
    }
  });
}

// ─────────────────────────────────────────────
// Slug utilities (same approach as animefire.js)
// ─────────────────────────────────────────────
var STOPWORDS = {
  a: 1, o: 1, os: 1, as: 1, de: 1, do: 1, da: 1, dos: 1, das: 1,
  the: 1, of: 1, and: 1, e: 1, "no": 1, na: 1, nos: 1, nas: 1,
  to: 1, in: 1, on: 1, at: 1, for: 1, ni: 1, wa: 1, ga: 1, wo: 1, ka: 1,
};

function normalize(str) {
  if (!str) return "";
  str = str.toLowerCase();
  str = str.replace(/[áàâãä]/g, "a")
           .replace(/[éèêë]/g, "e")
           .replace(/[íìîï]/g, "i")
           .replace(/[óòôõö]/g, "o")
           .replace(/[úùûü]/g, "u")
           .replace(/[ç]/g, "c")
           .replace(/[ñ]/g, "n")
           .replace(/[:：]/g, " ")
           .replace(/[^a-z0-9\s-]/g, " ")
           .replace(/\s+/g, " ")
           .trim();
  return str;
}

function slugify(str) {
  return normalize(str).replace(/\s+/g, "-");
}

function tokensOf(title, minLen) {
  if (!minLen) minLen = 3;
  return normalize(title)
    .split(" ")
    .filter(function (w) { return w && !STOPWORDS[w] && w.length >= minLen; });
}

function stripListSuffix(slug) {
  return slug
    .replace(/-todos-os-episodios$/, "")
    .replace(/-todos-episodios$/, "");
}

function slugBody(slug) {
  return slug
    .replace(/-dublado$/, "")
    .replace(/-legendado$/, "")
    .replace(/-online$/, "")
    .replace(/-[0-9]+$/, "");
}

function isStrictMatch(slug, expectedRoots, strongTokens) {
  if (!slug) return false;
  var body = slugBody(stripListSuffix(slug));

  for (var i = 0; i < expectedRoots.length; i++) {
    var root = expectedRoots[i];
    if (!root) continue;
    if (body === root) return true;
    if (body.indexOf(root + "-") === 0) return true;
  }

  for (var j = 0; j < expectedRoots.length; j++) {
    var r2 = expectedRoots[j];
    if (!r2 || r2.length < 6) continue;
    if (body.indexOf("-" + r2 + "-") !== -1) return true;
    if (body.length > r2.length && body.substring(body.length - r2.length - 1) === "-" + r2) return true;
  }

  if (strongTokens && strongTokens.length >= 2) {
    var hits = 0;
    for (var k = 0; k < strongTokens.length; k++) {
      if (body.indexOf(strongTokens[k]) !== -1) hits++;
    }
    var needed = Math.max(2, Math.ceil(strongTokens.length * 0.5));
    if (hits >= needed) return true;
  }

  return false;
}

// ─────────────────────────────────────────────
// TMDB
// ─────────────────────────────────────────────
function getTmdbInfo(tmdbId, type) {
  return __async(this, null, function* () {
    var path = type === "tv" ? "tv" : "movie";
    var base = "https://api.themoviedb.org/3/" + path + "/" + tmdbId;
    var ptRes = yield fetchJson(base + "?api_key=" + TMDB_API_KEY + "&language=pt-BR");
    if (!ptRes.data) return null;
    var d = ptRes.data;
    var origin = d.origin_country || [];
    var isJapaneseOrigin =
      d.original_language === "ja" ||
      origin.indexOf("JP") !== -1 ||
      origin.indexOf("JA") !== -1;

    var altTitles = [];
    var altRes = yield fetchJson(base + "/alternative_titles?api_key=" + TMDB_API_KEY);
    if (altRes && altRes.data) {
      var results = altRes.data.results || altRes.data.titles || [];
      for (var i = 0; i < results.length; i++) {
        var r = results[i];
        if (!r || !r.title) continue;
        var c = (r.iso_3166_1 || "").toUpperCase();
        if (c === "JP" || c === "US" || c === "GB" || c === "BR" || c === "PT") {
          altTitles.push(r.title);
        }
      }
    }

    return {
      title: d.title || d.name || "",
      originalTitle: d.original_title || d.original_name || "",
      altTitles: altTitles,
      year: ((d.release_date || d.first_air_date || "").split("-")[0]) || null,
      originalLanguage: d.original_language || "",
      originCountry: origin,
      isAnime: isJapaneseOrigin,
    };
  });
}

// ─────────────────────────────────────────────
// Expected roots for title matching
// ─────────────────────────────────────────────
function buildExpectedRoots(tmdbInfo) {
  var titles = [tmdbInfo.title, tmdbInfo.originalTitle]
    .concat(tmdbInfo.altTitles || [])
    .filter(Boolean);
  var roots = [];
  var seen = {};
  function push(s) { if (s && !seen[s]) { seen[s] = 1; roots.push(s); } }
  for (var i = 0; i < titles.length; i++) {
    var base = slugify(titles[i]);
    if (!base) continue;
    push(base);
    push(base.replace(/^the-/, ""));
    var afterColon = titles[i].indexOf(":") !== -1
      ? titles[i].split(":").slice(1).join(":")
      : "";
    if (afterColon) {
      var slug = slugify(afterColon);
      if (slug) push(slug);
    }
  }
  return roots;
}

function buildStrongTokens(info) {
  var source = [info.title, info.originalTitle].concat(info.altTitles || []);
  var seen = {};
  var out = [];
  for (var si = 0; si < source.length; si++) {
    var toks = tokensOf(source[si], 4);
    for (var ti = 0; ti < toks.length; ti++) {
      if (!seen[toks[ti]]) { seen[toks[ti]] = 1; out.push(toks[ti]); }
    }
  }
  return out;
}

// ─────────────────────────────────────────────
// Search animesdigital (returns list of {slug, url})
// ─────────────────────────────────────────────
function searchAnime(query) {
  return __async(this, null, function* () {
    if (!query) return [];
    var url = BASE_URL + "/?s=" + encodeURIComponent(query);
    var res = yield fetchText(url);
    if (!res || res.status !== 200 || res.text.length < 2000) return [];
    var results = [];
    var seen = {};
    // Matches: https://animesdigital.org/anime/a/<slug>  OR /desenho/d/<slug>
    var re = /href=["'](https?:\/\/animesdigital\.org\/(?:anime|desenho|dorama|tokusatsu)\/[a-z]+\/([a-z0-9-]+))\/?["']/gi;
    var m;
    while ((m = re.exec(res.text)) !== null) {
      var full = m[1];
      var slug = m[2];
      if (seen[slug]) continue;
      seen[slug] = 1;
      results.push({ url: full, slug: slug });
    }
    // Also scan filmes section
    var reFilm = /href=["'](https?:\/\/animesdigital\.org\/filme\/[a-z]+\/([a-z0-9-]+))\/?["']/gi;
    while ((m = reFilm.exec(res.text)) !== null) {
      var f = m[2];
      if (seen[f]) continue;
      seen[f] = 1;
      results.push({ url: m[1], slug: f });
    }
    return results;
  });
}

// ─────────────────────────────────────────────
// Build direct-guess slugs from expected roots (saves a round-trip for the
// most common naming conventions: <slug>, <slug>-dublado, <slug>-legendado).
// Returns list of {url, slug} objects; caller should check if URL resolves.
// ─────────────────────────────────────────────
function buildDirectGuessPages(tmdbInfo, season) {
  var titles = [tmdbInfo.title, tmdbInfo.originalTitle]
    .concat(tmdbInfo.altTitles || [])
    .filter(Boolean);
  var seen = {};
  var out = [];
  function push(slug) {
    if (!slug || seen[slug]) return;
    seen[slug] = 1;
    out.push({ url: BASE_URL + "/anime/a/" + slug, slug: slug });
  }
  for (var i = 0; i < titles.length; i++) {
    var base = slugify(titles[i]);
    if (!base) continue;
    push(base);
    push(base + "-dublado");
    push(base + "-legendado");
    // Variant without leading "the" (prevents missing "the-boys"-style slugs)
    var stripped = base.replace(/^the-/, "");
    if (stripped !== base) {
      push(stripped);
      push(stripped + "-dublado");
    }
    // Part after colon (e.g. "Demon Slayer: Kimetsu no Yaiba" → "kimetsu-no-yaiba")
    var afterColon = titles[i].indexOf(":") !== -1
      ? titles[i].split(":").slice(1).join(":")
      : "";
    if (afterColon) {
      var cs = slugify(afterColon);
      if (cs) {
        push(cs);
        push(cs + "-dublado");
        push(cs + "-legendado");
      }
    }
    // Season-qualified slugs (for anime that have "<name>-2-dublado", etc.)
    if (season && season > 1) {
      push(base + "-" + season);
      push(base + "-" + season + "-dublado");
    }
  }
  return out;
}

// ─────────────────────────────────────────────
// Quick HEAD-ish check: does /anime/a/<slug>/ exist? Return full HTML if yes.
// ─────────────────────────────────────────────
function tryFetchAnimePage(pageObj) {
  return __async(this, null, function* () {
    var res = yield fetchText(pageObj.url);
    if (!res || res.status !== 200) return null;
    // animesdigital returns a very small 404 page (<5KB). Real anime pages are
    // 100KB+. Use 40KB as a safe cutoff.
    if (res.text.length < 40000) return null;
    // Must actually contain at least one /video/a/ link
    if (res.text.indexOf("/video/a/") === -1) return null;
    return { url: pageObj.url, slug: pageObj.slug, html: res.text };
  });
}

// ─────────────────────────────────────────────
// Fetch paginated anime page. animesdigital uses ?paged=N (50 eps per page,
// newest-first). /page/N/ variants 404.
// ─────────────────────────────────────────────
var EPS_PER_PAGE = 50;

function fetchAnimePageN(baseUrl, pageNum) {
  return __async(this, null, function* () {
    var url = pageNum > 1 ? baseUrl + "?paged=" + pageNum : baseUrl;
    var res = yield fetchText(url);
    if (!res || res.status !== 200 || res.text.length < 40000) return null;
    return res.text;
  });
}

// Given the max ep # on page 1 and the target ep, return the page number
// where target is most likely to appear. Pages are newest-first, 50 eps each.
function guessPageForEpisode(maxEpOnPage1, targetEp) {
  if (!maxEpOnPage1 || maxEpOnPage1 <= 0) return 1;
  if (targetEp > maxEpOnPage1) return 1; // ep doesn't exist yet
  var indexFromTop = maxEpOnPage1 - targetEp + 1;
  return Math.max(1, Math.ceil(indexFromTop / EPS_PER_PAGE));
}

// ─────────────────────────────────────────────
// Parse episode list from anime page: returns [{id, epNum}]
// ─────────────────────────────────────────────
function parseEpisodes(html) {
  var eps = [];
  var seen = {};
  // Each episode is typically: <a href="https://animesdigital.org/video/a/NNN/" ...>…Episódio X…</a>
  var blockRe = /<a[^>]+href=["']https?:\/\/animesdigital\.org\/video\/[a-z]+\/([0-9]+)[^"']*["'][^>]*>([\s\S]*?)<\/a>/gi;
  var m;
  while ((m = blockRe.exec(html)) !== null) {
    var id = m[1];
    if (seen[id]) continue;
    var inner = m[2];
    // Extract episode number: "Episódio 1", "Ep. 1", "Episodio 1", etc.
    var numMatch =
      inner.match(/epis[oó]dio\s*([0-9]+)/i) ||
      inner.match(/\bep\.?\s*([0-9]+)/i) ||
      inner.match(/>\s*([0-9]+)\s*</);
    var num = numMatch ? parseInt(numMatch[1], 10) : null;
    seen[id] = 1;
    eps.push({ id: id, num: num });
  }
  return eps;
}

// ─────────────────────────────────────────────
// Extract HLS/MP4 from episode page
// ─────────────────────────────────────────────
function extractStream(html) {
  // 1) iframe to /videohls.php?d=<m3u8>
  var ifRe = /<iframe[^>]+src=["']([^"']+)["']/gi;
  var m;
  var iframes = [];
  while ((m = ifRe.exec(html)) !== null) iframes.push(m[1]);

  for (var i = 0; i < iframes.length; i++) {
    var src = iframes[i];
    // a) animes-digital style: api.anivideo.net/videohls.php?d=<m3u8>
    var dMatch = src.match(/[?&]d=([^&]+)/);
    if (dMatch) {
      var inner = dMatch[1];
      try { inner = decodeURIComponent(inner); } catch (e) {}
      if (/\.m3u8/i.test(inner)) return { url: inner, type: "hls", referer: BASE_URL + "/" };
      if (/\.mp4/i.test(inner)) return { url: inner, type: "mp4", referer: BASE_URL + "/" };
    }
    // b) direct .m3u8/.mp4 iframe (rare)
    if (/\.m3u8/i.test(src)) return { url: src, type: "hls", referer: BASE_URL + "/" };
    if (/\.mp4(\?|$)/i.test(src)) return { url: src, type: "mp4", referer: BASE_URL + "/" };
  }

  // 2) Direct .m3u8/.mp4 anywhere on the page (fallback)
  var direct = html.match(/https?:\/\/[^"'\s<>]+\.m3u8[^"'\s<>]*/gi);
  if (direct && direct.length) return { url: direct[0], type: "hls", referer: BASE_URL + "/" };
  var directMp4 = html.match(/https?:\/\/[^"'\s<>]+\.mp4[^"'\s<>]*/gi);
  if (directMp4 && directMp4.length) return { url: directMp4[0], type: "mp4", referer: BASE_URL + "/" };

  return null;
}

// ─────────────────────────────────────────────
// Build and return a stream object for Nuvio
// ─────────────────────────────────────────────
function toStream(sx, info, animeSlug, season, episode, relevance, isDubbed) {
  var titleBase =
    (info.title || info.originalTitle || "Anime") +
    (info.year ? " (" + info.year + ")" : "");
  var epTag = episode
    ? " · EP" + (season > 1 ? "S" + season + "E" + episode : String(episode))
    : "";
  var flag = isDubbed ? "DUB" : "LEG";
  return {
    _relevance: relevance || 0,
    name: PROVIDER_TAG + " · " + (sx.type === "hls" ? "HLS" : "MP4"),
    title: titleBase + epTag + " · " + animeSlug + " [PT-BR " + flag + "]",
    quality: sx.quality || "Auto",
    url: sx.url,
    type: sx.type,
    behaviorHints: {
      notWebReady: false,
      bingeGroup: "animesdigital-" + animeSlug,
    },
    headers: {
      "User-Agent": USER_AGENT,
      Referer: sx.referer || (BASE_URL + "/"),
      Origin: BASE_URL,
      Accept: sx.type === "hls"
        ? "application/vnd.apple.mpegurl,application/x-mpegURL,*/*"
        : "video/mp4,video/*;q=0.9,*/*;q=0.8",
    },
    provider: "animesdigital",
  };
}

// ─────────────────────────────────────────────
// Main entry point
// ─────────────────────────────────────────────
function getStreams(tmdbId, type, season, episode) {
  return __async(this, null, function* () {
    try {
      if (!tmdbId) return [];
      var info = yield getTmdbInfo(tmdbId, type);
      if (!info || (!info.title && !info.originalTitle)) return [];

      // GATE — only run for anime/JP origin. This site is an anime catalog
      // and returning slightly-off matches for non-anime titles is worse
      // than returning nothing at all.
      if (!info.isAnime) {
        console.log(
          "[" + PROVIDER_TAG + "] skipping non-anime: " +
          (info.title || info.originalTitle) +
          " (lang=" + info.originalLanguage + ", origin=" +
          (info.originCountry || []).join(",") + ")"
        );
        return [];
      }

      console.log(
        "[" + PROVIDER_TAG + "] " + type + " " +
        (info.title || info.originalTitle) + " (" + (info.year || "?") + ")" +
        (type === "tv" ? " S" + (season || 1) + "E" + (episode || 1) : "")
      );

      var expectedRoots = buildExpectedRoots(info);
      var strongTokens = buildStrongTokens(info);

      // Pick search queries (full titles first, then longest token as fallback).
      var queries = [];
      var src = [info.title, info.originalTitle].concat(info.altTitles || []);
      for (var qi = 0; qi < src.length; qi++) {
        var t = (src[qi] || "").trim();
        if (t && queries.indexOf(t) === -1) queries.push(t);
      }
      if (queries.length === 0) return [];

      // 1) DIRECT GUESSES — try predictable slug patterns first. These are
      //    tightest-fit and usually point to the canonical S1/series page.
      var candidatePages = [];
      var seenPage = {};
      var directGuesses = buildDirectGuessPages(info, season);
      var guessTried = 0;
      var MAX_GUESSES = 8;
      for (var g = 0; g < directGuesses.length && guessTried < MAX_GUESSES; g++) {
        if (seenPage[directGuesses[g].slug]) continue;
        seenPage[directGuesses[g].slug] = 1;
        guessTried++;
        var checked = yield tryFetchAnimePage(directGuesses[g]);
        if (checked) {
          candidatePages.push(checked);
          if (candidatePages.length >= 4) break;
        }
      }

      // 2) FALLBACK SEARCHES — fill remaining slots with search-discovered slugs
      //    that strict-match. Only run searches if we don't already have enough
      //    direct-guess hits.
      if (candidatePages.length < 4) {
        for (var q = 0; q < queries.length && candidatePages.length < 6; q++) {
          var searchResults = yield searchAnime(queries[q]);
          for (var sr = 0; sr < searchResults.length; sr++) {
            if (seenPage[searchResults[sr].slug]) continue;
            if (!isStrictMatch(searchResults[sr].slug, expectedRoots, strongTokens)) continue;
            seenPage[searchResults[sr].slug] = 1;
            candidatePages.push(searchResults[sr]);
            if (candidatePages.length >= 6) break;
          }
        }
      }

      if (candidatePages.length === 0) {
        console.log("[" + PROVIDER_TAG + "] no matching anime page found");
        return [];
      }

      console.log(
        "[" + PROVIDER_TAG + "] " + candidatePages.length + " candidate pages: " +
        candidatePages.map(function (p) { return p.slug; }).join(", ")
      );

      // For TV, try each candidate page; find episode matching `episode`.
      // For movies, each candidate page usually exposes 1 /video/a/<id>/ link.
      var targetEp = type === "tv" ? (episode || 1) : 1;
      var streams = [];

      for (var cp = 0; cp < candidatePages.length && streams.length < 4; cp++) {
        var page = candidatePages[cp];
        // Use cached HTML from direct-guess path; otherwise fetch now.
        var html = page.html || null;
        if (!html) {
          var pageRes = yield fetchText(page.url);
          if (!pageRes || pageRes.status !== 200) continue;
          html = pageRes.text;
        }

        var body = slugBody(stripListSuffix(page.slug));
        var isDubbed = /dublado/i.test(page.slug);

        // Compute relevance for this anime page.
        var relevance = 50;
        for (var rr = 0; rr < expectedRoots.length; rr++) {
          var root = expectedRoots[rr];
          if (!root) continue;
          if (body === root) { relevance = Math.max(relevance, 100); break; }
          if (body.indexOf(root + "-") === 0) { relevance = Math.max(relevance, 90); break; }
          if (body.indexOf("-" + root + "-") !== -1) relevance = Math.max(relevance, 70);
        }

        // Pick target episode:
        //   - For TV: find ep with `num === targetEp`. Calculate likely page
        //     from page-1 max ep. Fall back to ±1 page if off by one.
        //   - For movies: use the only /video/a/ link (no ep num needed).
        var target = null;
        if (type === "tv") {
          // Parse page 1 first to get the max ep on the site.
          var page1Eps = parseEpisodes(html);
          if (page1Eps.length === 0) continue;
          var page1Max = 0;
          for (var em = 0; em < page1Eps.length; em++) {
            if (typeof page1Eps[em].num === "number" && page1Eps[em].num > page1Max) {
              page1Max = page1Eps[em].num;
            }
          }
          // Try page 1 first.
          for (var e1 = 0; e1 < page1Eps.length; e1++) {
            if (page1Eps[e1].num === targetEp) { target = page1Eps[e1]; break; }
          }
          // If not on page 1, guess the right page directly.
          if (!target && page1Max > 0 && targetEp < page1Max) {
            var guessedPage = guessPageForEpisode(page1Max, targetEp);
            var pagesToTry = [guessedPage];
            if (guessedPage > 1) pagesToTry.push(guessedPage - 1);
            pagesToTry.push(guessedPage + 1);
            for (var gp = 0; gp < pagesToTry.length && !target; gp++) {
              var pn = pagesToTry[gp];
              if (pn <= 1) continue; // page 1 already scanned
              var pageHtml = yield fetchAnimePageN(page.url, pn);
              if (!pageHtml) continue;
              var epsN = parseEpisodes(pageHtml);
              for (var ei2 = 0; ei2 < epsN.length; ei2++) {
                if (epsN[ei2].num === targetEp) { target = epsN[ei2]; break; }
              }
            }
          }
          if (!target) {
            console.log(
              "[" + PROVIDER_TAG + "] ep " + targetEp + " not found in " + page.slug +
              " (max on site=" + page1Max + ")"
            );
            continue;
          }
        } else {
          // For a movie page, there's usually 1 /video/ link.
          var movieEps = parseEpisodes(html);
          if (movieEps.length === 0) continue;
          target = movieEps[0];
        }

        var epUrl = BASE_URL + "/video/a/" + target.id + "/";
        var epRes = yield fetchText(epUrl, { headers: { Referer: page.url } });
        if (!epRes || epRes.status !== 200) continue;

        var sx = extractStream(epRes.text);
        if (!sx) {
          console.log("[" + PROVIDER_TAG + "] no stream extracted from " + epUrl);
          continue;
        }

        var qMatch = sx.url.match(/(1080|720|480|360)p?/i);
        sx.quality = qMatch ? qMatch[1] + "p" : "Auto";

        console.log(
          "[" + PROVIDER_TAG + "] OK slug=" + page.slug +
          " ep=" + (target.num || "?") +
          " url=" + sx.url.substring(0, 120) +
          " rel=" + relevance
        );
        streams.push(toStream(sx, info, page.slug, season, targetEp, relevance, isDubbed));
      }

      // Sort by relevance desc, then dubbed first (PT-BR dubs first).
      streams.sort(function (a, b) {
        if (a._relevance !== b._relevance) return b._relevance - a._relevance;
        var aDub = /DUB/.test(a.title) ? 1 : 0;
        var bDub = /DUB/.test(b.title) ? 1 : 0;
        return bDub - aDub;
      });
      streams = streams.map(function (s) { delete s._relevance; return s; });
      if (streams.length > 4) streams = streams.slice(0, 4);

      console.log("[" + PROVIDER_TAG + "] total streams: " + streams.length);
      return streams;
    } catch (e) {
      console.log("[" + PROVIDER_TAG + "] fatal: " + (e && e.message));
      return [];
    }
  });
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { getStreams: getStreams };
} else if (typeof global !== "undefined") {
  global.getStreams = getStreams;
}
