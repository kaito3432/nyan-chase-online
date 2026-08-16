const CACHE_NAME = "nyan-chase-v2-online-beta1-20260816";
const PRECACHE = [
  "./",
  "./README.md",
  "./animation.js",
  "./assets/audio/.gitkeep",
  "./assets/audio/bgm_game.wav",
  "./assets/audio/bgm_home.wav",
  "./assets/audio/bgm_tension.wav",
  "./assets/audio/jingle_cat_win.wav",
  "./assets/audio/jingle_police_win.wav",
  "./assets/audio/se_button_tap.wav",
  "./assets/audio/se_capture.wav",
  "./assets/audio/se_footprint_found.wav",
  "./assets/audio/se_game_start.wav",
  "./assets/audio/se_invalid.wav",
  "./assets/audio/se_move.wav",
  "./assets/audio/se_search.wav",
  "./assets/audio/se_turn_change.wav",
  "./assets/images/.gitkeep",
  "./assets/images/bg_day.png",
  "./assets/images/box.png",
  "./assets/images/cat.png",
  "./assets/images/cutin_cat_win.jpg",
  "./assets/images/cutin_police_win.jpg",
  "./assets/images/cat_play_action.png",
  "./assets/images/cat_play_alert.png",
  "./assets/images/cat_play_normal.png",
  "./assets/images/cpu_select_cat.png",
  "./assets/images/cpu_select_dogs.png",
  "./assets/images/dog_blue.png",
  "./assets/images/dog_blue_play.png",
  "./assets/images/dog_card_blue.png",
  "./assets/images/dog_card_green.png",
  "./assets/images/dog_card_red.png",
  "./assets/images/dog_green.png",
  "./assets/images/dog_green_play.png",
  "./assets/images/dog_red.png",
  "./assets/images/dog_red_play.png",
  "./assets/images/home_cpu.png",
  "./assets/images/home_hero.png",
  "./assets/images/home_logo.png",
  "./assets/images/home_vs.png",
  "./assets/images/logo.png",
  "./assets/images/paw.png",
  "./assets/images/pwa/apple-touch-icon.png",
  "./assets/images/pwa/icon-192.png",
  "./assets/images/pwa/icon-512.png",
  "./assets/images/pwa/icon-maskable-512.png",
  "./assets/images/start.png",
  "./audio.js",
  "./engine.js",
  "./game.js",
  "./index.html",
  "./manifest.webmanifest",
  "./online.js",
  "./style.css"
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Navigation: prefer fresh HTML; fall back to cached app offline.
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then(res => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then(cache => cache.put("./index.html", copy));
          return res;
        })
        .catch(() => caches.match("./index.html"))
    );
    return;
  }

  // Static assets: cached first, then network and refresh cache.
  event.respondWith(
    caches.match(req, {ignoreSearch:true})
      .then(hit => hit || fetch(req).then(res => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(req, copy));
        }
        return res;
      }))
  );
});
