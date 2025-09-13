<div align="center">

<img src="https://github.com/SentoMarcos.png?size=200" width="120" height="120" style="border-radius: 50%;" alt="Avatar of Sento Marcos" />

# WebMinutes

[![Typing SVG](https://readme-typing-svg.demolab.com?font=Inter&weight=700&size=28&duration=2800&pause=900&color=3B82F6&center=true&vCenter=true&width=520&lines=Track+your+minutes+on+the+web;Private.+Simple.+On+your+device;Measure+social+media+and+web+usage)](https://github.com/SentoMarcos/WebMinutes)

<p>
  <a href="https://github.com/SentoMarcos/WebMinutes/stargazers">
    <img alt="GitHub stars" src="https://img.shields.io/github/stars/SentoMarcos/WebMinutes?style=for-the-badge&logo=github&color=3b82f6">
  </a>
  <a href="https://github.com/SentoMarcos/WebMinutes/issues">
    <img alt="Issues" src="https://img.shields.io/github/issues/SentoMarcos/WebMinutes?style=for-the-badge&color=60a5fa">
  </a>
  <a href="https://github.com/SentoMarcos/WebMinutes/blob/main/LICENSE">
    <img alt="License MIT" src="https://img.shields.io/badge/license-MIT-22c55e?style=for-the-badge">
  </a>
  <a href="https://chromewebstore.google.com/detail/EXTENSION_ID">
    <img alt="Chrome Web Store" src="https://img.shields.io/badge/Chrome%20Web%20Store-soon-111827?style=for-the-badge&logo=google-chrome">
  </a>
</p>

[English](README.md) | [Español](README.es.md)

</div>

---

## What is WebMinutes?

**WebMinutes** is a lightweight Chrome extension designed to help you **become more aware of the time you spend online**, especially on social media.  
- No account required.  
- Data is stored **locally on your device** (privacy first).  
- Minimalistic, visual UX without distractions.

### Features (MVP)
- Track **active URL time** + **idle detection**.  
- Group usage by apps (YouTube, Instagram, X, …) with favicons.  
- Daily stats: total time, top sites, top apps.  
- Export to CSV.  
- Reset daily stats.

Planned: weekly/monthly history, smart alerts, visual dashboard, light theme.

---

## Quick Demo
Add a GIF to `assets/demo.gif` (1280×800 recommended) and it will appear here.

<p align="center">
  <img src="assets/demo.gif" alt="WebMinutes Demo" width="720" style="border-radius:16px;">
</p>

---

## Installation (Developer Mode)

```bash
git clone https://github.com/SentoMarcos/WebMinutes.git
cd WebMinutes
```

1. Open `chrome://extensions` and enable **Developer mode**.  
2. Click **Load unpacked** and select the project folder.  
3. Pin the extension and open the popup. Done.

Tip: if you want to move the interface freely, use the “Open in window” button or adjust the icon handler to open a popup window (see `background.js`).

---

## Tech & Structure

- **Manifest V3**, background **service worker**.  
- **JavaScript** (tabs, idle, focus) + **chrome.storage.local**.  
- **HTML/CSS** dark soft design with light neumorphism.

```
/webminutes/
  ├ manifest.json
  ├ background.js
  ├ popup.html
  ├ popup.js
  ├ popup.css
  └ icon_files/
       ├ icon-16.png
       ├ icon-48.png
       └ icon-128.png
```

---

## Roadmap

- Weekly/monthly history.  
- Custom notifications (e.g., “1h on YouTube”).  
- Dashboard with charts.  
- Ignored apps/domains list.  
- Light theme / theme system.  
- Pro version (advanced exports, PDFs, shortcuts, widgets).

See the [Roadmap board](https://github.com/SentoMarcos/WebMinutes/projects).

---

## Contributing

Feedback and PRs are welcome.

- Open [Issues](https://github.com/SentoMarcos/WebMinutes/issues) for bugs, ideas, improvements.  
- Vote on proposals.  
- Send PRs (features, perf, accessibility, i18n, tests).  
- Join Discussions (if enabled).

### Quick PR Guide
1. Branch off `main`: `feat/short-name` or `fix/descriptive-bug`.  
2. Clearly describe changes and testing steps.  
3. Include screenshots for UI.  
4. Keep `manifest.json` and permissions minimal.

---

## Privacy

- No accounts. No servers. Data lives in your browser.  
- No trackers, no ads, no data selling.  
- See `PRIVACY.md` (coming soon).

---

## Community

- Star this repo if you find it useful.  
- Share your daily summary (export image coming soon).  
- Follow me: [@SentoMarcos](https://github.com/SentoMarcos)

---

## License

This project is under the MIT license — see [LICENSE](LICENSE).  
© 2025 Sento Marcos

---

<div align="center">

Built with care by [SentoMarcos](https://github.com/SentoMarcos)

![Waves](https://capsule-render.vercel.app/api?type=waving&color=0:0b1020,50:243b6b,100:1d4ed8&height=90&section=footer)

</div>
