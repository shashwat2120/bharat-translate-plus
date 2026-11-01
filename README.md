# Bharat Translate+

Translate **and simplify** any web page into Indian languages, right inside Chrome.
Free, private, and runs on your own computer using Chrome's built-in AI. No server or API key.

**Languages:** Hindi, Marathi, Tamil, Telugu, Kannada, Bengali (+ English "simplify only")

## Screenshots
<!-- Add your images to docs/screenshots/, then remove the comment markers around the lines below. -->
<!--
![Side panel with language picker](docs/screenshots/panel.png)
![English news page translated to Hindi](docs/screenshots/translated-page.png)
-->

## What it does
- **Translate this page:** replaces the page text with your language. Visible text goes first.
- **Simplify too:** long paragraphs are rewritten in easy words before translating.
- **Show original:** puts the page back exactly as it was.
- **Right-click → "Translate & simplify with Bharat Translate+"** on any selected text.
- **Read aloud:** speaks the result in the chosen language (needs a voice installed on the computer).
- **Accessibility:** sets the correct `lang` attribute on translated text so screen readers pronounce it properly. Fully keyboard usable, with dark mode.

## How it works
```
Page text → detect language → (simplify in English with Gemini Nano) → translate with Chrome Translator → back into the page
```
If the page is not in English and "Simplify" is on, the text is first translated to English, simplified, and then translated to your language.

## Requirements
- **Chrome 138 or newer on desktop** (Windows, Mac, Linux, Chromebook Plus)
- **Translation** works on most computers.
- **Simplifying** needs Gemini Nano: 22 GB free disk space, and either a GPU with more than 4 GB VRAM or 16 GB RAM with 4+ CPU cores.
  If the computer can't run it, the extension still translates and tells the user that simplifying is off.
- AI models download once on first use. Use Wi-Fi.

## Try it on your computer (5 minutes)
1. Clone this repo (or download it as a ZIP and unzip it).
2. Open `chrome://extensions` in Chrome.
3. Turn on **Developer mode** (top right).
4. Click **Load unpacked** and choose the project folder.
5. Pin the extension, open any English news site, click the icon, and press **Translate this page**.
6. Open **"AI status on this computer"** at the bottom of the panel to see what's ready.

**If simplifying says "not available"**, open `chrome://on-device-internals` to check the model status,
or `chrome://flags/#optimization-guide-on-device-model` and set it to **Enabled**, then restart Chrome.

## Files
| File | Purpose |
|---|---|
| `manifest.json` | Extension settings and permissions |
| `background.js` | Opens the side panel, adds the right-click menu |
| `sidepanel.html` / `.css` / `.js` | The panel UI and all the AI logic |
| `icons/` | Toolbar and store icons |
| `PRIVACY.md` | Privacy policy, needed for the Chrome Web Store |
| `STORE_LISTING.md` | Ready-to-paste text for the store listing |

## Known limits (version 0.1)
- Links and bold or italic text inside a translated paragraph become plain text. "Show original" brings them back.
- Gujarati, Malayalam, Punjabi, Odia and Urdu aren't in Chrome's built-in translator yet.
- Doesn't work on mobile Chrome, or on `chrome://` and Web Store pages.
- Very long pages: the first 400 text blocks are translated.

## Ideas for version 0.2
- Keep links clickable after translation
- Reading level choice (Very simple / Simple / Normal)
- "Explain this word" on double-click
- Auto-translate chosen sites

## Author
Made by **[Shashwat Mishra](https://github.com/shashwat2120)** — mshashwat2127@gmail.com

Licensed under the [MIT License](LICENSE).
