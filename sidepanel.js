// Bharat Translate+ — side panel logic
// Pipeline: detect language → (simplify in English with Gemini Nano) → translate with Chrome's Translator.
// Everything runs on the user's computer through Chrome's built-in AI. No server, no API key.

const $ = (id) => document.getElementById(id);

const LANG_NAMES = {
  en: "English", hi: "Hindi", mr: "Marathi", ta: "Tamil",
  te: "Telugu", kn: "Kannada", bn: "Bengali",
};
const SPEECH_TAGS = {
  en: "en-IN", hi: "hi-IN", mr: "mr-IN", ta: "ta-IN",
  te: "te-IN", kn: "kn-IN", bn: "bn-IN",
};

// Only simplify text at least this long; headings and buttons are just translated.
const MIN_SIMPLIFY_CHARS = 80;
const MAX_BLOCKS = 400;

const SIMPLIFY_SYSTEM_PROMPT =
  "You rewrite text in simple, plain English for someone with basic reading skills. " +
  "Use short sentences and common everyday words. Explain hard terms in a few words. " +
  "Keep every fact, name, number, date and amount exactly the same. Do not add new information. " +
  "Reply with only the rewritten text, nothing else.";

const state = {
  translators: new Map(), // "en>hi" -> Translator
  simplifier: null,       // base LanguageModel session
  detector: null,
  running: false,
  cancel: false,
  lastOutputLang: "hi",
};

// ---------- UI helpers ----------

function setStatus(msg, isError = false) {
  const el = $("status");
  el.textContent = msg;
  el.classList.toggle("error", isError);
}

function setProgress(done, total) {
  $("progressWrap").hidden = total === 0;
  $("progressBar").style.width = total ? `${Math.round((done / total) * 100)}%` : "0";
}

function setBusy(busy) {
  state.running = busy;
  $("translatePage").disabled = busy;
  $("translateText").disabled = busy;
  $("restore").disabled = busy;
  $("stop").hidden = !busy;
}

function langName(code) {
  return LANG_NAMES[code] || code;
}

function downloadMonitor(label) {
  return (m) => {
    m.addEventListener("downloadprogress", (e) => {
      setStatus(`Downloading ${label}… ${Math.round(e.loaded * 100)}% (only the first time)`);
    });
  };
}

// ---------- Built-in AI wrappers ----------

async function getTranslator(source, target) {
  const key = `${source}>${target}`;
  if (state.translators.has(key)) return state.translators.get(key);
  if (!("Translator" in self)) {
    throw new Error("This Chrome version has no built-in translator. Please update to Chrome 138 or newer on a computer.");
  }
  const availability = await Translator.availability({ sourceLanguage: source, targetLanguage: target });
  if (availability === "unavailable") {
    throw new Error(`Chrome can't translate ${langName(source)} → ${langName(target)} on this computer yet.`);
  }
  const translator = await Translator.create({
    sourceLanguage: source,
    targetLanguage: target,
    monitor: downloadMonitor(`${langName(source)} → ${langName(target)} language pack`),
  });
  state.translators.set(key, translator);
  return translator;
}

// Returns the simplifier session, or null if this computer can't run Gemini Nano.
async function getSimplifier() {
  if (state.simplifier) return state.simplifier;
  if (!("LanguageModel" in self)) return null;
  const opts = {
    expectedInputs: [{ type: "text", languages: ["en"] }],
    expectedOutputs: [{ type: "text", languages: ["en"] }],
  };
  const availability = await LanguageModel.availability(opts);
  if (availability === "unavailable") return null;
  state.simplifier = await LanguageModel.create({
    ...opts,
    initialPrompts: [{ role: "system", content: SIMPLIFY_SYSTEM_PROMPT }],
    monitor: downloadMonitor("the AI model"),
  });
  return state.simplifier;
}

async function simplify(text) {
  // Clone so each paragraph starts fresh and the context window never fills up.
  const session = await state.simplifier.clone();
  try {
    const out = await session.prompt(`Rewrite this in simple words:\n\n${text}`);
    return out.trim() || text;
  } finally {
    session.destroy();
  }
}

async function getDetector() {
  if (state.detector) return state.detector;
  if (!("LanguageDetector" in self)) return null;
  state.detector = await LanguageDetector.create();
  return state.detector;
}

async function detectLanguage(sample) {
  try {
    const detector = await getDetector();
    if (!detector) return "en";
    const [top] = await detector.detect(sample);
    if (top && top.confidence > 0.5 && top.detectedLanguage !== "und") {
      return top.detectedLanguage.split("-")[0];
    }
  } catch (err) {
    console.warn("Language detection failed", err);
  }
  return "en";
}

// Prepare models right away, while Chrome still counts this as a user click
// (needed the first time a model has to download).
async function prepare(target, wantSimplify) {
  const translatorTask = target !== "en" ? getTranslator("en", target) : Promise.resolve();
  const simplifierTask = wantSimplify ? getSimplifier() : Promise.resolve(null);
  const detectorTask = getDetector();
  const [translatorResult] = await Promise.allSettled([translatorTask, simplifierTask, detectorTask]);
  if (translatorResult.status === "rejected") throw translatorResult.reason;
  return wantSimplify && !!state.simplifier;
}

// Make sure every translator this run needs exists before starting, so a
// missing language pair fails once with a clear message instead of per block.
async function ensureTranslators(source, target, useSimplify) {
  if (useSimplify && source !== "en") {
    await getTranslator(source, "en");
    if (target !== "en") await getTranslator("en", target);
  } else if (source !== target) {
    await getTranslator(source, target);
  }
}

function simplifyNote(wantSimplify, useSimplify) {
  return wantSimplify && !useSimplify ? " (Simplifying isn't available on this computer, so it was translated only.)" : "";
}

// One piece of text through the whole pipeline.
async function processText(text, source, target, useSimplify) {
  let out = text;
  let lang = source;

  if (useSimplify && out.length >= MIN_SIMPLIFY_CHARS) {
    if (lang !== "en") {
      out = await (await getTranslator(lang, "en")).translate(out);
      lang = "en";
    }
    out = await simplify(out);
  }
  if (lang !== target) {
    out = await (await getTranslator(lang, target)).translate(out);
  }
  return out;
}

// ---------- Functions injected into the web page ----------

function pageExtractBlocks(maxBlocks) {
  const SEL = "p,li,h1,h2,h3,h4,h5,h6,blockquote,td,th,dt,dd,figcaption,caption,summary,label";
  const SKIP = "script,style,noscript,code,pre,textarea,input,select," +
    "[contenteditable]:not([contenteditable='false']),[aria-hidden='true'],[translate='no'],.notranslate";
  // Replacing a block's text would delete these, so leave such blocks alone.
  const CONTROLS = "input,select,textarea,button";
  window.__btOrig = window.__btOrig || new Map();
  window.__btCounter = window.__btCounter || 0;

  const blocks = [];
  for (const el of document.querySelectorAll(SEL)) {
    if (el.closest(SKIP)) continue;
    if (el.querySelector(SEL)) continue; // only innermost blocks
    if (el.querySelector(CONTROLS)) continue;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) continue;

    let id = el.dataset.btId;
    if (!id) {
      id = "bt" + window.__btCounter++;
      el.dataset.btId = id;
    }
    // If already translated, start from the original text again.
    const saved = window.__btOrig.get(id);
    const text = (saved ? saved.text : el.innerText || "").trim();
    if (text.length < 2 || !/\p{L}/u.test(text)) continue;

    blocks.push({ id, text, top: rect.top });
  }

  // What the reader can see right now goes first.
  const vh = window.innerHeight;
  blocks.sort((a, b) => {
    const av = a.top >= -50 && a.top < vh ? 0 : 1;
    const bv = b.top >= -50 && b.top < vh ? 0 : 1;
    return av - bv || 0;
  });
  return blocks.slice(0, maxBlocks).map(({ id, text }) => ({ id, text }));
}

function pageApply(updates) {
  window.__btOrig = window.__btOrig || new Map();
  for (const { id, text, lang } of updates) {
    const el = document.querySelector(`[data-bt-id="${id}"]`);
    if (!el) continue;
    if (!window.__btOrig.has(id)) {
      // Keep the original nodes themselves so links keep their event listeners on restore.
      window.__btOrig.set(id, {
        nodes: Array.from(el.childNodes),
        text: el.innerText,
        lang: el.getAttribute("lang"),
      });
    }
    el.textContent = text;
    // Correct lang attribute so screen readers pronounce it properly.
    el.setAttribute("lang", lang);
  }
}

function pageRestore() {
  const saved = window.__btOrig;
  if (!saved || saved.size === 0) return 0;
  let n = 0;
  for (const [id, orig] of saved) {
    const el = document.querySelector(`[data-bt-id="${id}"]`);
    if (!el) continue;
    el.replaceChildren(...orig.nodes);
    if (orig.lang === null) el.removeAttribute("lang");
    else el.setAttribute("lang", orig.lang);
    n++;
  }
  saved.clear();
  return n;
}

// ---------- Talking to the current tab ----------

async function activeTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.id) throw new Error("No open tab found.");
  return tab;
}

async function runInPage(tabId, func, args = []) {
  try {
    const [res] = await chrome.scripting.executeScript({ target: { tabId }, func, args });
    return res ? res.result : undefined;
  } catch (err) {
    throw new Error("Chrome doesn't allow extensions on this page (for example, chrome:// pages or the Web Store). Try a normal website.");
  }
}

// ---------- Main actions ----------

async function translatePage() {
  if (state.running) return;
  const target = $("lang").value;
  const wantSimplify = $("simplify").checked;
  setBusy(true);
  state.cancel = false;

  try {
    setStatus("Getting ready…");
    const useSimplify = await prepare(target, wantSimplify);

    const tab = await activeTab();
    setStatus("Reading the page…");
    const blocks = await runInPage(tab.id, pageExtractBlocks, [MAX_BLOCKS]);
    if (!blocks || blocks.length === 0) {
      setStatus("No readable text found on this page.");
      return;
    }

    const sample = blocks.map((b) => b.text).join(" ").slice(0, 1500);
    const source = await detectLanguage(sample);

    if (source === target && !useSimplify) {
      setStatus(`This page already looks like ${langName(target)}.${simplifyNote(wantSimplify, useSimplify)}`);
      return;
    }
    await ensureTranslators(source, target, useSimplify);

    setStatus(`Working on ${blocks.length} parts of the page (${langName(source)} → ${langName(target)})…`);
    let done = 0;
    let failed = 0;
    let lastError = null;
    let batch = [];
    setProgress(0, blocks.length);

    for (const block of blocks) {
      if (state.cancel) break;
      try {
        const text = await processText(block.text, source, target, useSimplify);
        // Unchanged text is left alone so its links and formatting survive.
        if (text !== block.text) batch.push({ id: block.id, text, lang: target });
      } catch (err) {
        console.warn("Skipped one block", err);
        failed++;
        lastError = err;
      }
      done++;
      setProgress(done, blocks.length);
      // Push results to the page in small batches so the user sees progress.
      if (batch.length >= 4) {
        await runInPage(tab.id, pageApply, [batch]);
        batch = [];
      }
    }
    if (batch.length) await runInPage(tab.id, pageApply, [batch]);

    if (failed && failed === done) {
      throw lastError || new Error("Couldn't translate this page.");
    }
    const skipped = failed ? ` ${failed} parts couldn't be translated.` : "";
    setStatus((state.cancel
      ? `Stopped. ${done} of ${blocks.length} parts done.`
      : `Done! Page shown in ${langName(target)}${useSimplify ? ", in simple words" : ""}.`) +
      skipped + simplifyNote(wantSimplify, useSimplify));
  } catch (err) {
    console.error(err);
    setStatus(err.message || String(err), true);
  } finally {
    setBusy(false);
    setTimeout(() => setProgress(0, 0), 1500);
  }
}

async function restorePage() {
  try {
    const tab = await activeTab();
    const n = await runInPage(tab.id, pageRestore);
    setStatus(n ? "Original page restored." : "Nothing to restore on this page.");
  } catch (err) {
    setStatus(err.message || String(err), true);
  }
}

async function translateText() {
  if (state.running) return;
  const text = $("input").value.trim();
  if (!text) {
    setStatus("Paste or select some text first.");
    $("input").focus();
    return;
  }
  const target = $("lang").value;
  const wantSimplify = $("simplify").checked;
  setBusy(true);

  try {
    setStatus("Getting ready…");
    const useSimplify = await prepare(target, wantSimplify);
    const source = await detectLanguage(text);
    await ensureTranslators(source, target, useSimplify);
    setStatus("Translating…");

    // Split into paragraphs so long text keeps its shape.
    const parts = text.split(/\n\s*\n/);
    const results = [];
    for (const part of parts) {
      results.push(part.trim() ? await processText(part.trim(), source, target, useSimplify) : "");
    }

    const out = $("output");
    out.textContent = results.join("\n\n");
    out.setAttribute("lang", target);
    state.lastOutputLang = target;
    $("outputWrap").hidden = false;
    setStatus(`Done (${langName(source)} → ${langName(target)}).${simplifyNote(wantSimplify, useSimplify)}`);
  } catch (err) {
    console.error(err);
    setStatus(err.message || String(err), true);
  } finally {
    setBusy(false);
  }
}

function speakOutput() {
  const text = $("output").textContent;
  if (!text) return;
  speechSynthesis.cancel();
  const tag = SPEECH_TAGS[state.lastOutputLang] || "en-IN";
  const utter = new SpeechSynthesisUtterance(text);
  utter.lang = tag;
  const voice = speechSynthesis.getVoices().find((v) => v.lang.toLowerCase().startsWith(tag.slice(0, 2)));
  if (voice) {
    utter.voice = voice;
  } else {
    setStatus(`No ${langName(state.lastOutputLang)} voice is installed on this computer. Add one in your system's language settings.`);
  }
  utter.rate = 0.95;
  speechSynthesis.speak(utter);
}

async function copyOutput() {
  try {
    await navigator.clipboard.writeText($("output").textContent);
    setStatus("Copied.");
  } catch {
    setStatus("Couldn't copy. Select the text and press Ctrl+C.", true);
  }
}

// ---------- Text sent from the right-click menu ----------

async function takePendingSelection() {
  const { pendingSelection } = await chrome.storage.session.get("pendingSelection");
  if (!pendingSelection || !pendingSelection.text) return;
  await chrome.storage.session.remove("pendingSelection");
  $("input").value = pendingSelection.text;
  setStatus("Selected text added. Click “Translate text”.");
  $("translateText").focus();
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "session" && changes.pendingSelection && changes.pendingSelection.newValue) {
    takePendingSelection();
  }
});

// ---------- Support check ----------

async function showSupport() {
  const list = $("support");
  const rows = [];
  const LABELS = {
    available: "ready ✅",
    downloadable: "will download on first use ⬇️",
    downloading: "downloading ⏳",
    unavailable: "not supported on this computer ❌",
  };
  const check = async (name, fn) => {
    try {
      const value = await fn();
      rows.push(`${name}: ${LABELS[value] || value}`);
    } catch {
      rows.push(`${name}: not available ❌`);
    }
  };
  await check("Translator", async () =>
    "Translator" in self
      ? await Translator.availability({ sourceLanguage: "en", targetLanguage: $("lang").value === "en" ? "hi" : $("lang").value })
      : "not in this Chrome");
  await check("Simplifier (Gemini Nano)", async () =>
    "LanguageModel" in self ? await LanguageModel.availability() : "not in this Chrome");
  await check("Language detector", async () =>
    "LanguageDetector" in self ? await LanguageDetector.availability() : "not in this Chrome");

  list.innerHTML = "";
  for (const r of rows) {
    const li = document.createElement("li");
    li.textContent = r;
    list.appendChild(li);
  }
}

// ---------- Start ----------

async function init() {
  const { lang, simplify: simp } = await chrome.storage.local.get(["lang", "simplify"]);
  if (lang) $("lang").value = lang;
  if (typeof simp === "boolean") $("simplify").checked = simp;

  $("lang").addEventListener("change", () => {
    chrome.storage.local.set({ lang: $("lang").value });
    showSupport();
  });
  $("simplify").addEventListener("change", () => chrome.storage.local.set({ simplify: $("simplify").checked }));
  $("translatePage").addEventListener("click", translatePage);
  $("restore").addEventListener("click", restorePage);
  $("stop").addEventListener("click", () => { state.cancel = true; setStatus("Stopping…"); });
  $("translateText").addEventListener("click", translateText);
  $("speak").addEventListener("click", speakOutput);
  $("copy").addEventListener("click", copyOutput);

  speechSynthesis.getVoices(); // warm up the voice list
  showSupport();
  takePendingSelection();
}

init();
