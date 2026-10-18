// يخزّن ملفات التطبيق ليعمل بدون إنترنت. غيّر رقم النسخة عند تعديل الملفات.
const CACHE = "khatma-v2";
const STATE = "khatma-state";
const SHELL = ["./", "index.html", "manifest.webmanifest", "icon.svg", "icon-192.png", "icon-512.png", "apple-touch-icon.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE && k !== STATE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;
  const isFont = url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com";
  if (!sameOrigin && !isFont) return;
  if (url.pathname.endsWith("/state.json")) return;
  e.respondWith(
    caches.match(req, { ignoreSearch: true }).then((hit) => {
      const net = fetch(req).then((res) => {
        if (res && (res.ok || res.type === "opaque")) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      }).catch(() => hit);
      return hit || net;
    })
  );
});

// عند الضغط على الإشعار يفتح التطبيق
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  e.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const c of list) { if ("focus" in c) return c.focus(); }
      return self.clients.openWindow("./");
    })
  );
});

// تذكير الساعة ٥ في الخلفية (يعمل فقط في المتصفحات والأجهزة اللي تدعم المزامنة الدورية)
self.addEventListener("periodicsync", (e) => {
  if (e.tag === "khatma-daily") e.waitUntil(dailyReminder());
});

async function dailyReminder() {
  const now = new Date();
  if (now.getHours() < 17) return;
  const pad = (n) => (n < 10 ? "0" : "") + n;
  const today = now.getFullYear() + "-" + pad(now.getMonth() + 1) + "-" + pad(now.getDate());
  const cache = await caches.open(STATE);
  const key = new URL("state.json", self.registration.scope).href;
  const hit = await cache.match(key);
  if (!hit) return;
  const st = await hit.json();
  if (!st.on || st.notified === today) return;
  const doneToday = st.date === today && st.ok;
  const title = doneToday ? "بارك الله فيك يا " + st.name : "ورد اليوم ينتظرك يا " + st.name;
  const body = doneToday ? "أنجزت ورد اليوم." : "افتح التطبيق وأنجز الحفظ والمراجعة والربط" + (st.streak > 0 ? " قبل ما ينقطع ستريكك." : ".");
  await self.registration.showNotification(title, { body, icon: "icon-192.png", badge: "icon-192.png", tag: "daily-" + today, lang: "ar", dir: "rtl" });
  st.notified = today;
  await cache.put(key, new Response(JSON.stringify(st), { headers: { "Content-Type": "application/json" } }));
}
