# Project brief: misinformation checker (working name "Second Look")

## What we are building
A tool that lets anyone check, in one or two taps, whether a post, forwarded message or image they saw online is accurate or AI-generated. It gives a verdict, the reasons behind it, links to trusted sources, and a kind reply the user can send back to whoever shared it.

The file `second-look.html` in this folder is a clickable prototype of the experience. Use it as the reference for the result screen, verdict types and tone.

## Who it is for
- Everyday social media users on X, Facebook, Instagram and TikTok.
- Older relatives who receive forwarded rumours in WhatsApp family groups.
- Launch market: Nigeria. Languages: English, Yorùbá, Hausa (later Igbo and Nigerian Pidgin). The product must work worldwide, so region and language are settings, never hard-coded.

## Core principles (do not break these)
1. Never claim certainty. Verdicts are calibrated estimates with a confidence score and reasons.
2. Always show sources the user can open and check themselves. Never invent a URL.
3. Prefer "can't confirm yet" over guessing, especially for breaking news.
4. AI-image detection is unreliable. Be cautious, and always offer reverse image search.
5. Tone is warm and respectful, never mocking. Assume the person who shared the rumour meant well.
6. Privacy: users may forward personal family messages. Store as little as possible, delete promptly, and follow Nigeria's Data Protection Act (NDPA 2023) and other local laws where we launch.

## Verdicts
Text claims: `likely_true`, `likely_false`, `misleading`, `unverified`.
Images: `likely_authentic`, `likely_ai`, `likely_edited`, `cant_tell`.

Every result returns JSON with: verdict, confidence (0–100), headline (one sentence), explanation (2–3 sentences), signals (3–5 items, each "support" or "concern"), sources (2–3, each with name, url and why), tip (one sentence).

## Trusted sources
Nigeria: Dubawa, Africa Check, FactCheckHub, TheCable Fact Check, NCDC (health).
International: Reuters Fact Check, AP News, AFP Fact Check, Snopes, Full Fact, FactCheck.org, PolitiFact, BBC News, WHO, CDC, NASA, Google Fact Check Explorer.
Regional: PesaCheck (East Africa), BOOM and Alt News (India), Chequeado (Latin America), Aos Fatos (Brazil), Maldita (Spain), VERA Files (Philippines), Misbar (Arab world).
Images: TinEye, Google Lens.
Keep this list in one config file so it is easy to update. Confirm each source is still active before launch.

## Build phases
1. **Checking engine + web app.** A small backend that takes text or an image, calls the Anthropic API with live web search so it can check current news, and returns the JSON above. A simple mobile-friendly web page on top of it (based on the prototype). Keep the API key on the server only.
2. **WhatsApp bot.** Users forward a message or image to our WhatsApp number and get the result and kind reply back, in their language. Reuses the same engine. Uses the WhatsApp Business Platform (Meta).
3. **Browser extension** for desktop X and Facebook: a Check button beside posts.
4. **Mobile app** that appears in the phone's Share menu, since Instagram, TikTok and WhatsApp do not allow buttons inside their apps.

## How to work with me (the founder)
- I am new to coding. Explain what you are doing in plain language, one step at a time.
- Before adding a new service, account or paid tool, tell me what it is, what it costs roughly, and ask first.
- Never put secret keys in code files. Use a `.env` file and make sure it is in `.gitignore`.
- After each working step, tell me how to try it myself.
