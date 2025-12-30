// script.js — Full working player (albums + sidebar + player)
// Server assumptions:
// - Album list available at: http://127.0.0.1:3000/spotify/music/
// - Album folder URL pattern: http://127.0.0.1:3000/spotify/music/<album>/
// - Album info.json (optional) at: /spotify/music/<album>/info.json
// - Audio files accessible at: http://127.0.0.1:3000/spotify/music/<album>/<encoded-file>.mp3

console.log("Spotify Clone Script Loaded (fresh rebuild)");

// --- Globals ---
const SERVER_BASE = "http://127.0.0.1:3000";
const ALBUMS_DIR = `${SERVER_BASE}/spotify/music/`; // directory that lists albums
const AUDIO_BASE_PATH = `${SERVER_BASE}/spotify/music/`; // used as base for audio src

let albums = [];               // array of album folder names (strings)
let songs = [];                // array of { decoded, encoded } for current album
let currentAlbum = "";         // selected album folder name
let currentIndex = 0;          // index of currently playing song
let audio = new Audio();       // single global audio element

// --- Utility helpers ---
const log = (...args) => console.log("[player]", ...args);
const safeQuery = (sel) => document.querySelector(sel) || null;

function formatTime(seconds) {
  if (!seconds || isNaN(seconds)) return "00:00";
  seconds = Math.floor(seconds);
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return String(m).padStart(2, "0") + ":" + String(s).padStart(2, "0");
}

// Given a raw href from server, return just the last folder or filename (decoded)
function lastPathSegment(rawHref) {
  if (!rawHref) return "";
  const decoded = decodeURIComponent(rawHref);
  const parts = decoded.split(/[/\\]/).filter(Boolean);
  return parts.length ? parts[parts.length - 1] : "";
}

// --- Albums: load and render cards ---
async function fetchAlbumFolders() {
  try {
    log("Fetching album listing from", ALBUMS_DIR);
    const r = await fetch(ALBUMS_DIR);
    const html = await r.text();
    const div = document.createElement("div");
    div.innerHTML = html;
    const anchors = div.getElementsByTagName("a");
    const list = [];
    for (const a of anchors) {
      const href = a.getAttribute("href");
      if (!href || href === "../") continue;
      // server may list "ncs/" or "%5Cspotify%5Cmusic%5Ccs/" etc. Grab last folder token
      const candidate = lastPathSegment(href); // will return 'ncs' for 'ncs/' and 'cs' for weird paths
      // ensure it's not a file (no .mp3 suffix)
      if (!candidate.toLowerCase().endsWith(".mp3") && candidate !== "") {
        list.push(candidate);
      }
    }
    // dedupe while preserving order
    return Array.from(new Set(list));
  } catch (err) {
    console.error("Error fetching album folders:", err);
    return [];
  }
}

async function fetchAlbumMetadata(folder) {
  const url = `${ALBUMS_DIR}${encodeURIComponent(folder)}/info.json`;
  try {
    const res = await fetch(url);
    if (!res.ok) {
      log("No info.json for", folder, " — status", res.status);
      return { title: folder, description: "" };
    }
    const data = await res.json();
    return { title: data.title || folder, description: data.description || "" };
  } catch (err) {
    log("Error reading info.json for", folder, err);
    return { title: folder, description: "" };
  }
}

async function renderAlbumCards() {
  const container = safeQuery(".song-list");
  if (!container) {
    log("renderAlbumCards: .song-list container not found");
    return;
  }
  container.innerHTML = "";

  albums = await fetchAlbumFolders();
  log("Albums found:", albums);

  for (const folder of albums) {
    // fetch info.json safely
    const meta = await fetchAlbumMetadata(folder);

    const card = document.createElement("div");
    card.className = "card";
    card.dataset.album = folder;
    // Build markup (simple)
    card.innerHTML = `
      <div class="play">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40" width="40" height="40">
          <circle cx="20" cy="20" r="20" fill="#1DB954" />
          <g transform="translate(8, 8)">
            <path d="M18.8906 12.846C18.5371 14.189 16.8667 15.138 13.5257 17.0361C10.296 18.8709 8.6812 19.7884 7.37983 19.4196C6.8418 19.2671 6.35159 18.9776 5.95624 18.5787C5 17.6139 5 15.7426 5 12C5 8.2574 5 6.3861 5.95624 5.42132C6.35159 5.02245 6.8418 4.73288 7.37983 4.58042C8.6812 4.21165 10.296 5.12907 13.5257 6.96393C16.8667 8.86197 18.5371 9.811 18.8906 11.154C19.0365 11.7084 19.0365 12.2916 18.8906 12.846Z" fill="#000000" stroke="#1ed760" stroke-width="1.5" stroke-linejoin="round"/>
          </g>
        </svg>
      </div>
      <img src="/spotify/music/${encodeURIComponent(folder)}/cover.jpg" alt="${meta.title} cover" onerror="this.style.opacity=0.5;">
      <h2>${escapeHtml(meta.title)}</h2>
      <p>${escapeHtml(meta.description)}</p>
    `;
    container.appendChild(card);
  }

  // attach click listeners
  container.querySelectorAll(".card").forEach(card => {
    card.addEventListener("click", async () => {
      const album = card.dataset.album;
      if (!album) return;
      await loadSongs(album);
      // scroll to top of left sidebar (optional)
      const left = safeQuery(".left");
      if (left) left.scrollTop = 0;
    });
  });
}

// small helper to avoid XSS in innerHTML insertion of meta text
function escapeHtml(str) {
  if (!str) return "";
  return str.replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
}

// --- Songs: load songs for album and render sidebar ---
async function loadSongs(album) {
  try {
    currentAlbum = album;
    const url = `${ALBUMS_DIR}${encodeURIComponent(album)}/`;
    log("Loading songs from", url);
    const r = await fetch(url);
    const html = await r.text();
    const div = document.createElement("div");
    div.innerHTML = html;
    const anchors = div.getElementsByTagName("a");
    const list = [];

    for (const a of anchors) {
      const raw = a.getAttribute("href");
      if (!raw) continue;
      if (raw.toLowerCase().endsWith(".mp3")) {
        const filenameDecoded = lastPathSegment(raw);           // decoded filename
        const filenameEncoded = encodeURIComponent(filenameDecoded);
        list.push({ decoded: filenameDecoded, encoded: filenameEncoded });
      }
    }

    songs = list;
    log("Songs parsed for", album, ":", songs.map(s => s.decoded));

    renderSongList();
    if (songs.length) {
      currentIndex = 0;
      loadTrack(currentIndex, false); // load first without autoplay
    } else {
      // clear UI
      updateSongInfo(null);
    }
  } catch (err) {
    console.error("loadSongs error:", err);
    songs = [];
    renderSongList();
    updateSongInfo(null);
  }
}

function renderSongList() {
  const ul = safeQuery(".songlist ul");
  if (!ul) {
    log("renderSongList: .songlist ul not found");
    return;
  }
  ul.innerHTML = "";
  songs.forEach((s, idx) => {
    const li = document.createElement("li");
    li.className = "song-item";
    li.dataset.index = idx;
    li.innerHTML = `
      <img src="/spotify/svg/music.svg" alt="music">
      <div class="info">
        <div class="title">${escapeHtml(s.decoded)}</div>
        <div class="artist">Aman Dadheech</div>
      </div>
      <span class="playnow"><span>Play Now</span>
        <img src="/spotify/svg/play-circle.svg" alt="play"></span>
    `;
    li.addEventListener("click", () => {
      const i = Number(li.dataset.index);
      loadTrack(i, true);
    });
    ul.appendChild(li);
  });
  highlightActiveSong();
}

// --- Player actions ---
function loadTrack(index, autoplay = true) {
  if (!songs || songs.length === 0) {
    log("No songs to play");
    return;
  }
  if (index < 0 || index >= songs.length) {
    log("Index out of range:", index);
    return;
  }
  currentIndex = index;
  const item = songs[index];
  // build audio URL using encoded filename
  audio.src = `${AUDIO_BASE_PATH}${encodeURIComponent(currentAlbum)}/${item.encoded}`;
  log("Loading audio:", audio.src);

  updateSongInfo(item);
  highlightActiveSong();

  if (autoplay) {
    audio.play().catch(e => log("Play prevented:", e));
    setPlayButtonPause();
  } else {
    setPlayButtonPlay();
  }
}

function updateSongInfo(item) {
  const infoEl = safeQuery(".songinfo");
  const timeEl = safeQuery(".songtime");
  if (infoEl) infoEl.textContent = item ? item.decoded : "";
  if (timeEl) timeEl.textContent = "00:00 / 00:00";
}

function highlightActiveSong() {
  const listItems = Array.from(document.querySelectorAll(".songlist li"));
  listItems.forEach((li, idx) => {
    li.classList.toggle("active", idx === currentIndex);
  });
}

// next / previous
function playNext() {
  if (!songs || songs.length === 0) return;
  const next = (currentIndex + 1) % songs.length;
  loadTrack(next, true);
}
function playPrev() {
  if (!songs || songs.length === 0) return;
  const prev = (currentIndex - 1 + songs.length) % songs.length;
  loadTrack(prev, true);
}

// Play button helpers
function setPlayButtonPause() {
  const img = safeQuery(".songbuttons img[alt='Play'], .songbuttons img[alt='play']");
  if (img && img.tagName === "IMG") img.src = "/spotify/svg/pause.svg";
}
function setPlayButtonPlay() {
  const img = safeQuery(".songbuttons img[alt='Play'], .songbuttons img[alt='play']");
  if (img && img.tagName === "IMG") img.src = "/spotify/svg/play-circle.svg";
}

// --- Controls wiring ---
function initControls() {
  // Play/pause
  const playImg = safeQuery(".songbuttons img[alt='Play'], .songbuttons img[alt='play']");
  if (playImg) {
    playImg.addEventListener("click", () => {
      if (audio.paused) {
        audio.play().catch(e => log("Play prevented:", e));
        setPlayButtonPause();
      } else {
        audio.pause();
        setPlayButtonPlay();
      }
    });
  }

  // Prev / Next
  const prevBtn = safeQuery(".songbuttons img[alt='Previous']");
  const nextBtn = safeQuery(".songbuttons img[alt='next']");
  if (prevBtn) prevBtn.addEventListener("click", playPrev);
  if (nextBtn) nextBtn.addEventListener("click", playNext);

  // Seekbar (input range with id=seekbar). If you still use .seekbar div, the code below will not break but prefer range.
  const seekRange = safeQuery("#seekbar");
  if (seekRange) {
    seekRange.addEventListener("input", (e) => {
      const val = Number(e.target.value);
      if (audio.duration) audio.currentTime = (val / 100) * audio.duration;
    });
  } else {
    // fallback: click-to-seek on div.seekbar with .circle element
    const seekDiv = safeQuery(".seekbar");
    if (seekDiv) {
      seekDiv.addEventListener("click", (e) => {
        const rect = seekDiv.getBoundingClientRect();
        const pct = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
        if (audio.duration) audio.currentTime = pct * audio.duration;
      });
    }
  }

  // Volume toggle (element .volume or #volume-icon). Also optional range #volume-range
  const volumeIcon = safeQuery(".volume, #volume-icon, .volume-icon");
  if (volumeIcon) {
    volumeIcon.addEventListener("click", () => {
      audio.muted = !audio.muted;
      volumeIcon.classList.toggle("muted", audio.muted);
    });
  }
  const volumeRange = safeQuery("#volume-range");
  if (volumeRange) {
    volumeRange.addEventListener("input", (e) => {
      audio.volume = Math.min(1, Math.max(0, Number(e.target.value)));
    });
    // set initial volume
    audio.volume = Number(volumeRange.value || 1);
  } else {
    audio.volume = 1;
  }

  // Audio time update
  audio.addEventListener("timeupdate", () => {
    const cur = audio.currentTime || 0;
    const dur = audio.duration || 0;
    const timeEl = safeQuery(".songtime");
    if (timeEl) timeEl.textContent = `${formatTime(cur)} / ${formatTime(dur)}`;

    // update seek input if present
    const r = safeQuery("#seekbar");
    if (r && dur > 0) {
      const pct = Math.min(100, Math.max(0, (cur / dur) * 100));
      r.value = pct;
    }
    // or update .circle fallback
    const circle = safeQuery(".seekbar .circle");
    if (circle && dur > 0) {
      const pct = Math.min(100, Math.max(0, (cur / dur) * 100));
      circle.style.left = pct + "%";
    }
  });

  // ended -> next
  audio.addEventListener("ended", () => {
    playNext();
  });

  // safety: log audio errors
  audio.addEventListener("error", (e) => {
    console.error("Audio error:", e);
  });
}

// --- Boot sequence ---
async function boot() {
  // render album cards
  albums = await fetchAlbumFolders();
  await renderAlbumCards();

  // default album: pick first found or 'ncs' if exists
  const defaultAlbum = albums.includes("ncs") ? "ncs" : (albums[0] || "");
  if (defaultAlbum) {
    await loadSongs(defaultAlbum);
  }
  initControls();
}

// hamburger/left toggles (optional - from your previous code)
const hamburger = document.querySelector(".hamburger");
if (hamburger) {
  hamburger.addEventListener("click", () => {
    document.querySelector(".left").style.left = "0px";
  });
}
const closeLeft = document.querySelector(".left .close");
if (closeLeft) {
  closeLeft.addEventListener("click", () => {
    document.querySelector(".left").style.left = "-110%";
  });
}

boot().catch(err => console.error("Boot error:", err));

/* End of script.js */
