# Family Trip

A simple travel companion for the family: itinerary, Now & Next, hotel cards for taxi drivers, money converter, phrasebook and packing lists. It works offline once opened.

It is a plain web app (no build step). It runs in **preview mode** (saved on one device only) until the Firebase settings are added to `js/config.js`.

---

## 1. Try it on this computer

In a terminal in this folder:

```
python -m http.server 8765
```

Then open http://localhost:8765 in Chrome.

To load the real trip: **Create a new trip → Start from a plan file** and choose `private/japan-taiwan-2026.json`.
(That file has confirmation numbers in it, so it lives in `private/`, which is never uploaded to GitHub. To rebuild it from the spreadsheet notes, run `python private/make-plan-file.py`.)

---

## 2. Set up Firebase (the shared family database), about 20 minutes

1. Go to https://console.firebase.google.com and click **Create a project**. Name it something like `family-trip`. You can turn Google Analytics **off**.
2. **Upgrade to Blaze (pay as you go)**: click the plan name at the bottom left, then *Upgrade*. Attachments need this. A five-person family stays inside the free allowance. Then set a budget alert: Google Cloud console → Billing → Budgets & alerts → create a budget of **$5** with email alerts.
3. **Anonymous sign-in**: Build → Authentication → Get started → Sign-in method → **Anonymous** → Enable → Save.
4. **Database**: Build → Firestore Database → Create database → pick a location near you (e.g. `us-central1`) → *Start in production mode*.
   Then open the **Rules** tab, delete everything, paste in the contents of `firestore.rules` from this folder, and click **Publish**.
5. **File storage**: Build → Storage → Get started → same location → production mode.
   Open the **Rules** tab, paste in `storage.rules`, and click **Publish**.
6. **Register the web app**: Project settings (gear icon) → *Your apps* → click the `</>` (Web) icon → name it `Family Trip` → leave "Firebase Hosting" unticked → Register.
   Firebase shows a block of code with `const firebaseConfig = { ... }`. Copy the values between the braces.
7. Open `js/config.js` and replace `null` with those values (there is an example in the file). Save.
8. In `sw.js`, change `const VERSION = 'v1'` to `'v2'` (do this every time you publish a change, so phones pick it up).

Reload the app. The "Preview" label in the header disappears once it's connected. Create the trip again from the plan file. That trip is now the shared one.

---

## 3. Put it online with GitHub Pages (free hosting)

1. Create a new repository on https://github.com (for example `family-trip`). It can be **private** on a paid plan.
2. Upload this folder's files (Claude can do this for you with `git push` once the repository exists). The `private/` folder, `.xlsx` and `.docx` files are automatically left out.
3. In the repository: Settings → Pages → *Build and deployment* → Source: **Deploy from a branch**, Branch: `main`, folder `/ (root)` → Save.
4. After about a minute the app is at `https://<your-github-name>.github.io/family-trip/`.
5. In Firebase: Authentication → Settings → **Authorized domains** → add `<your-github-name>.github.io`.

---

## 4. Install it on everyone's phone

Send the trip code from **More → Trip settings → Text the code**. The message has a link that fills the code in.

**iPhone (Safari):** open the link → tap the Share button → **Add to Home Screen** → Add. Always open the app from the home-screen icon.

**Android (Chrome):** open the link → tap **Install** (or ⋮ menu → *Add to Home screen* / *Install app*).

Open the app once while on Wi-Fi and look through the trip. After that it works offline (map and weather need internet; the last weather forecast is kept).

**Adding a place from Google Maps:**
- Android: in Google Maps, tap **Share** on a place → choose **Family Trip**.
- iPhone: in Google Maps, tap **Share → Copy link**, then in the app paste it into "Paste a Google Maps link" and tap **Fill in from link**.

---

## What's built (spec sections)

| Spec | Status |
|---|---|
| Trip code, pick your name, several trips per device (3, 4) | ✅ |
| Now & Next home screen with city, local time, weather (5) | ✅ |
| Daily timeline, all event fields, Google Maps button, per-person filter (6) | ✅ |
| Map view with pins (OpenStreetMap, online only) (6) | ✅ |
| Manual entry + Google Maps link / Android share (7) | ✅ |
| Attachments, cached for offline (PDFs saved as page pictures) (8) | ✅ (needs Firebase) |
| Important events + reminder lead time (9) | ⚠️ in-app reminder banner only; **push notifications are the next step** (see below) |
| Wishlist + Add to plan (10) | ✅ |
| Show-to-driver hotel cards (11) | ✅ |
| Currency converter with shared manual rates (12) | ✅ |
| Trip time + Dallas time (13) | ✅ |
| Daily weather from Open-Meteo, cached (14) | ✅ |
| Phrasebook, Japanese & Mandarin, tap to hear (15) | ✅ |
| Personal packing lists (16) | ✅ |
| Google Photos album link (17) | ✅ |
| Backup file export / import | ✅ (extra) |

### Push reminders (still to do)
Push notifications need a small server-side job that checks for upcoming Important events and sends the notification through Firebase Cloud Messaging. Plan: a scheduled GitHub Action (free, runs every 10 minutes, no extra software on this PC) using a Firebase service-account key stored as a GitHub secret. It can only be built and tested once the Firebase project exists. iPhone users must have the app on the home screen to receive pushes.

## Files

- `index.html`, `styles.css`: the page and its look
- `js/app.js`: start-up and screen switching
- `js/views-*.js`: the screens
- `js/store.js`: saving data (Firebase or preview mode)
- `js/config.js`: **your Firebase settings go here**
- `sw.js`: offline support
- `firestore.rules`, `storage.rules`: security rules to paste into Firebase
