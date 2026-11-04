# Second Look

Check a post, forwarded message or picture before you believe it or share it.

Second Look gives a calibrated verdict (likely true, likely false, misleading, or can't confirm yet), the reasons behind it, links to trusted fact-checkers so people can check for themselves, and a kind reply to send back to whoever shared it.

Launch market: Nigeria (English, Yorùbá, Hausa; Igbo and Nigerian Pidgin later). Region and language are settings, so it works worldwide.

See [CLAUDE.md](CLAUDE.md) for the full project brief and principles.

## What's in this repo

| File | What it does |
|---|---|
| `server.js` | The server. Shows the web app and checks text or pictures with Claude, using live web search. The API key stays here. |
| `prompts.js` | The instructions given to Claude for each kind of check, and for the kind reply. |
| `sources.json` | The list of trusted sources (fact-checkers, health agencies, news). Edit this file to add or remove one. |
| `public/index.html` | The web app: home screen, checking screen and result screen. |
| `public/demo.html` | A demo showing how Second Look could appear inside X, Facebook, Instagram, TikTok and WhatsApp. |
| `public/phone.html` | A preview of the app inside an iPhone-sized frame. |
| `second-look.html` | The original clickable prototype. |
| `.env.example` | A template for the secret settings file. |

## Run it on your computer

You need [Node.js](https://nodejs.org) (the LTS version).

1. Download this repo and open a terminal in its folder.
2. Install the libraries:
   ```
   npm install
   ```
3. Copy `.env.example` to a new file named `.env`. To switch on live checks, put your Anthropic API key after `ANTHROPIC_API_KEY=`. Without a key, the app runs in preview mode with example results only, at no cost.
4. Start it:
   ```
   npm start
   ```
5. Open http://localhost:3000 in your browser.

To try it on a phone on the same Wi-Fi, run `npm run phone` instead and open the address it prints.

## Privacy and safety

- Nothing people check is saved or logged.
- The API key lives only in `.env`, which is never uploaded (see `.gitignore`).
- Source links are only shown if they come from Claude's web search and are on the trusted source's own website. Otherwise a search link for that site is shown. Links are never invented.

## Roadmap

1. Web app and checking engine (this version)
2. WhatsApp bot
3. Browser extension for X and Facebook
4. Mobile app in the phone's Share menu
