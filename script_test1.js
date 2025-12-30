console.log("Let's Write Some JavaScript Code!");
console.log("Spotify Clone Script Loaded");

const FETCH_URL = "/spotify/music/"; // change to "http://127.0.0.1:3002/spotify/music/" if needed

let currentSong = new Audio();
let songs = [];          // array of { encoded, decoded }
let currentIndex = 0;

// safe format time
function formatTime(seconds) {
    if (!seconds || isNaN(seconds)) return "00:00";
    seconds = Math.floor(seconds);
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return String(minutes).padStart(2, "0") + ":" + String(secs).padStart(2, "0");
}

async function getSongs() {
    const res = await fetch(FETCH_URL);
    const html = await res.text();

    const container = document.createElement("div");
    container.innerHTML = html;

    const anchors = container.getElementsByTagName("a");
    const list = [];

    for (let i = 0; i < anchors.length; i++) {
        const a = anchors[i];
        const rawHref = a.getAttribute("href");
        if (!rawHref) continue;
        if (rawHref.toLowerCase().endsWith(".mp3")) {
            // decoded path (backslashes or %5C become visible)
            const decodedHref = decodeURIComponent(rawHref);
            // filename only (handles both forward and back slashes)
            const filename = decodedHref.split(/[/\\]/).pop();
            // encoded name safe for URL
            const encodedName = encodeURIComponent(filename);
            list.push({ encoded: encodedName, decoded: filename });
        }
    }
    return list;
}

function updateUIForTrack(item) {
    const songInfoEl = document.querySelector(".songinfo");
    const songTimeEl = document.querySelector(".songtime");
    if (songInfoEl) songInfoEl.textContent = item ? item.decoded : "";
    if (songTimeEl) songTimeEl.textContent = "00:00 / 00:00";

    // optional: highlight current <li>
    const listItems = document.querySelectorAll(".songlist li");
    listItems.forEach((li, idx) => {
        if (idx === currentIndex) li.classList.add("active");
        else li.classList.remove("active");
    });
}

function playMusicByIndex(index, autoplay = true) {
    if (!songs || songs.length === 0) return;
    if (index < 0 || index >= songs.length) return;

    currentIndex = index;
    const item = songs[index];

    // build URL using encoded filename and correct folder
    currentSong.src = "/spotify/music/" + item.encoded;

    updateUIForTrack(item);

    if (autoplay) {
        currentSong.play().catch(err => {
            // autoplay blocked or other error
            console.warn("Playback prevented:", err);
        });
        // swap play button image if present
        const playImg = document.querySelector(".songbuttons img[alt='Play'], .songbuttons img[alt='play'], #playBtnImg");
        if (playImg && playImg.tagName === "IMG") playImg.src = "/spotify/svg/pause.svg";
    }
}

async function main() {
    songs = await getSongs();

    if (!songs || songs.length === 0) {
        console.warn("No songs found.");
        return;
    }

    // populate list
    const songUL = document.querySelector(".songlist ul");
    if (!songUL) {
        console.warn(".songlist ul not found in DOM");
        return;
    }
    songUL.innerHTML = ""; // clear

    songs.forEach((s, idx) => {
        const li = document.createElement("li");
        li.innerHTML = `
            <img src="/spotify/svg/music.svg" alt="music">
            <div class="info">
                <div class="title">${s.decoded}</div>
                <div class="artist">Aman Dadheech</div>
            </div>
            <span class="playnow">
                <span>Play Now</span>
                <img src="/spotify/svg/play-circle.svg" alt="play">
            </span>`;
        li.style.cursor = "pointer";
        li.addEventListener("click", () => playMusicByIndex(idx, true));
        songUL.appendChild(li);
    });

    // load first song but don't autoplay
    playMusicByIndex(0, false);

    // play/pause button in controls (.songbuttons)
    const playBtnImg = document.querySelector(".songbuttons img[alt='Play'], .songbuttons img[alt='play'], #playBtnImg");
    if (playBtnImg) {
        playBtnImg.addEventListener("click", () => {
            if (currentSong.paused) {
                currentSong.play();
                if (playBtnImg.tagName === "IMG") playBtnImg.src = "/spotify/svg/pause.svg";
            } else {
                currentSong.pause();
                if (playBtnImg.tagName === "IMG") playBtnImg.src = "/spotify/svg/play-circle.svg";
            }
        });
    } else {
        // fallback: if play button is not an image, try a generic selector
        const playBtn = document.querySelector(".songbuttons [alt='Play'], .songbuttons .play");
        if (playBtn) {
            playBtn.addEventListener("click", () => {
                if (currentSong.paused) currentSong.play();
                else currentSong.pause();
            });
        }
    }

    // previous / next
    const previousBtn = document.querySelector(".songbuttons img[alt='Previous']");
    const nextBtn = document.querySelector(".songbuttons img[alt='next']");

    if (previousBtn) {
        previousBtn.addEventListener("click", () => {
            console.log("Previous Button Clicked");
            const prevIndex = (currentIndex - 1 + songs.length) % songs.length;
            playMusicByIndex(prevIndex, true);
        });
    }
    if (nextBtn) {
        nextBtn.addEventListener("click", () => {
            console.log("Next Button Clicked");
            const nextIndex = (currentIndex + 1) % songs.length;
            playMusicByIndex(nextIndex, true);
        });
    }

    // update time display and seek knob
    const songTimeEl = document.querySelector(".songtime");
    const circle = document.querySelector(".seekbar .circle");

    currentSong.addEventListener("timeupdate", () => {
        const cur = currentSong.currentTime || 0;
        const dur = currentSong.duration || 0;
        if (songTimeEl) songTimeEl.textContent = `${formatTime(cur)} / ${formatTime(dur)}`;
        if (circle && dur > 0) {
            const pct = Math.min(100, Math.max(0, (cur / dur) * 100));
            circle.style.left = pct + "%";
        }
    });

    // click on seekbar to seek
    const seekbar = document.querySelector(".seekbar");
    if (seekbar) {
        seekbar.addEventListener("click", (e) => {
            const rect = seekbar.getBoundingClientRect();
            const percent = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
            if (currentSong.duration) currentSong.currentTime = percent * currentSong.duration;
        });
    }

    // auto play next on ended
    currentSong.addEventListener("ended", () => {
        const nextIndex = (currentIndex + 1) % songs.length;
        playMusicByIndex(nextIndex, true);
    });

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
}

main().catch(err => console.error(err));
