# Trastienda

Paste the page source of your Shopify store and see who can run code in it: apps, old script tags, scripts somebody pasted by hand, and addresses that imitate a known service.

En español: pega el código fuente de tu tienda Shopify y Trastienda te dice quién puede ejecutar código en ella (apps, script tags antiguos, scripts pegados a mano) y qué direcciones imitan a un servicio conocido.
Funciona en tu navegador, sin cuenta, sin instalar ninguna app en la tienda y sin subir nada.

**Live demo:** https://freyesperales.github.io/dev-experiments-365/experiments/experiment-108/ (add `?lang=es` for Spanish)

## Sample run

`node trastienda.js --demo shop` runs on an invented shop (`www.example.com`) that has three old script tags, two apps, a tag manager and one script from an imitation address:

```
Trastienda 1.0.0  ·  Store: www.example.com (tienda-ejemplo.myshopify.com) · theme Dawn 15.2.0

>> LOOK AT THIS TODAY
   Marked FIX below: 1. An address that imitates a known service, or code written to hide what it does.

11 scripts (6 files, 5 written in the page) · 8 outside parties can run code here · 3 legacy script tags

[FIX]      Unknown service: jsdeliver.cloud
        ! shopify.jsdeliver.cloud is not the jsDelivr CDN (that one is jsdelivr.net, with no second "e"). Shopify Support called this domain a red flag in a reported case.
        Not added through the app system of Shopify: it is in the theme code or was pasted by hand, so it stays when you uninstall apps. This tool does not recognise it. Find out who added it and what for.
        Seen as: script file
        From: shopify.jsdeliver.cloud
        Files: shopify.jsdeliver.cloud/npm/slider@2/dist/slider.min.js
[CHECK]    Unknown service: example.org
        Not added through the app system of Shopify: it is in the theme code or was pasted by hand, so it stays when you uninstall apps. This tool does not recognise it. Find out who added it and what for.
        Seen as: script file
        From: cdn.example.org
        Files: cdn.example.org/chat-widget.js
[CHECK]    Legacy script tag: d1example2abc.cloudfront.net
        An app registered this through the old ScriptTag API, which stops on 1 March 2027. Work out which app it belongs to and ask its developer whether they have moved to an app embed. Shopify removes script tags when the app that created them is uninstalled, so an unknown one should belong to an app that is still installed.
        The address is rented space on cloudfront.net: anybody can open a name there, so the address alone does not tell you who is behind it.
        Seen as: legacy script tag
        From: d1example2abc.cloudfront.net
        Files: d1example2abc.cloudfront.net/popup.js
[CHECK]    Legacy script tag: example.net
        An app registered this through the old ScriptTag API, which stops on 1 March 2027. Work out which app it belongs to and ask its developer whether they have moved to an app embed. Shopify removes script tags when the app that created them is uninstalled, so an unknown one should belong to an app that is still installed.
        Seen as: legacy script tag
        From: app.example.net
        Files: app.example.net/widget/loader.js
[INFO]     Google Tag Manager
        Not added through the app system of Shopify: it is in the theme code or was pasted by hand, so it stays when you uninstall apps. A well-known service. Keep it only if you still use it.
        Seen as: loaded by code in the page
        From: www.googletagmanager.com
        Files: www.googletagmanager.com/gtm.js
[INFO]     Legacy script tag: Judge.me
        An app registered this through the old ScriptTag API, which stops on 1 March 2027. Work out which app it belongs to and ask its developer whether they have moved to an app embed. Shopify removes script tags when the app that created them is uninstalled, so an unknown one should belong to an app that is still installed.
        Seen as: legacy script tag
        From: cdn.judge.me
        Files: cdn.judge.me/assets/installed.js
[INFO]     App: opciones-ejemplo  ×2
        Added by an installed app through a theme app extension. You can switch it off in the theme editor (App embeds), and Shopify removes it when you uninstall the app.
        It also brings code from: opciones-ejemplo-b7hq.b01.azurefd.net. What those servers send can change at any time without Shopify or you seeing it. That is how the October 2026 hijack travelled.
        Seen as: app block or embed
        Blocks: embed
[INFO]     App: resenas-ejemplo
        Added by an installed app through a theme app extension. You can switch it off in the theme editor (App embeds), and Shopify removes it when you uninstall the app.
        Seen as: app block or embed, app extension
        Blocks: widget
        Files: widget.js
[OK]       Code written straight into the theme (1 snippet)
        Somebody typed or pasted this into theme.liquid, a snippet or a Custom Liquid section. It runs with full access to the page. Uninstalling an app does not remove it.
[OK]       Your theme's own files  ×2
        Files that are part of the theme. They change only when somebody edits the theme.
[OK]       Shopify itself  ×3
        The platform's own code. Nothing to do.

- 3 legacy script tags will stop loading on 1 March 2027 (apps cannot create or change them since 1 October 2026). If a feature of your store depends on one, it stops that day.
- Pixels: the page loads Shopify's pixel manager (1 app pixel(s), 1 custom). Pixels run in a sandbox and cannot touch the page. Review them in the Customer events section of your admin.

What to do next
1. In Settings > Apps, uninstall what you no longer use. Open each remaining app's page and read "Activity and permissions": anything under "Unused access" is access the app has and does not use.
2. In the theme editor, open App embeds and switch off the ones you do not recognise.
3. In the Customer events section of your admin, review the pixels.
4. Open your store in a private window, add a product and press Checkout. Look at the address bar before typing anything: if it shows a domain that is neither your store nor Shopify, stop and call Shopify Support.
5. Save this inventory and run it again after installing an app or changing the theme. A new name you did not add is the thing to look at.

What this cannot see
- Code that an app downloads after the page loads. In October 2026 the files of the affected apps were clean; the attack arrived as settings from the app developers' servers. No reading of the page source finds that. What you can control is how many parties are on this list.
- Pages you did not paste. Product, cart and collection pages can load different scripts.
- What a script does. This is a list of who is present and of a few clear warning signs, not an analysis of each file.
- Shopify's checkout. It is not part of the theme and has its own protections.
```

The exit code is 1 because there is something to look at.

## Install and run

No install. Node 18 or newer, one file:

```
node trastienda.js page.html                            # the page source you saved from your store
node trastienda.js home.html product.html cart.html     # several pages at once
node trastienda.js theme.liquid                         # or the theme file
node trastienda.js page.html --apps apps.txt            # your installed apps, one per line: puts an owner on each script
node trastienda.js page.html --save inventory.json      # keep today's inventory
node trastienda.js page.html --baseline inventory.json  # next time: what is new, what is gone
node trastienda.js page.html --lang es                  # Spanish
node trastienda.js page.html --json                     # for scripts
node trastienda.js --demo shop                          # invented examples: shop, clean, liquid
```

To get the page source: open your store as a visitor, right click, "View page source" (Ctrl+U), then save or copy everything. Use "View page source", not "Inspect": the first is what Shopify sent, the second also shows what scripts added later.

Exit codes: 0 nothing odd and nothing changed, 1 something to fix, to check or that changed, 2 usage or input error (including a text with no scripts).

## Who it is for

The owner of a small Shopify store, or the person who looks after it, who has installed and removed apps for years and no longer knows what runs on the storefront.

## What it does

- **Puts every script under an owner.** Shopify itself; the theme's own files; each app that comes in through a theme app extension (recognised by the `shopify://apps/...` comments Shopify prints around app blocks and by the `cdn.shopify.com/extensions/...` address of its files); each legacy script tag (read from the `asyncLoad` list Shopify prints in the head); services loaded straight from the theme code; and code typed into the theme.
- **Attributes what an app brings with it.** A script loaded from inside an app block is listed under that app, with the outside servers it calls.
- **Dates the script tags.** Shopify stops loading them on 1 March 2027. Each one is listed so you can ask the app's developer before that day.
- **Spots imitation addresses.** One letter away from a known name (`jsdeliver.cloud` for `jsdelivr.net`), a known name on an unusual ending, bare IP addresses, plain `http://`, and `polyfill.io`.
- **Looks for a few clear warning signs in code typed into the page.** Deliberately scrambled code, text that is decoded and then run, and a click handler that cancels the checkout click and sends the browser elsewhere.
- **Recognises the published indicators of the October 2026 checkout hijack** (the fake-checkout domains and the session marker of the script) anywhere in the text.
- **Reads theme source too.** In a `theme.liquid` it lists the snippets the file pulls in and warns when the theme edits `content_for_header` to hide a script.
- **Compares with last time.** Save the inventory; the next run shows new parties and new addresses inside apps you already had.

## Why it exists

- In October 2026 several popular Shopify apps were used to send shoppers to a fake checkout. The app file on Shopify's CDN was unchanged; the code arrived as settings from the app developer's own servers ([Roman Zipp, 2026-10-10](https://romanzipp.com/blog/shopify-hit-with-phishing-attack), [iTnews, 2026-10-16](https://www.itnews.com.au/news/shopify-tells-australian-store-to-stay-shut-after-hijacked-extensions-divert-shoppers-629693)). Every app on a storefront is a party you trust with your customers' browser, and most owners cannot list them.
- Owners find a script in their page and cannot tell where it comes from. One was told "It's impossible to tell from the code what injects it exactly" ([Shopify Community, 2025](https://community.shopify.com/t/help-identifying-were-malicious-script-is-loaded-from-in-my-source-some-app/417102)). Another found `shopify.jsdeliver.cloud` in the source and could not separate it from a legitimate analytics app block ([Shopify Community, 2026](https://community.shopify.com/t/urgent-need-help-removing-malicious-code-injections-jsdeliver-cloud-brandagents-js-from-shrine-theme/600137)).
- Script tags are being switched off: no new ones since 1 October 2026, none loaded after 1 March 2027 ([shopify.dev](https://shopify.dev/docs/apps/build/online-store/script-tag-deprecation/storefront)). A store that depends on one loses that feature on that day.

The similar tools found in this run are apps you install in the store with access to its data, in English, some of them paid. All sources are in [RESEARCH.md](RESEARCH.md).

## Limitations

- **It cannot see code that arrives after the page loads.** The October 2026 attack would not have appeared in the page source of an affected store. For that case this tool gives you the list of parties that could deliver such code, so you can shorten it, and it recognises the published indicators if they are present.
- It reads only what you paste. Product, cart and collection pages can load other scripts. The checkout is not part of the theme and is not covered.
- It does not download or analyse any script file. The warning signs apply only to code written directly in the page.
- Attribution is a reading of how Shopify prints things today (the `asyncLoad` list, the app block comments, the extension addresses, the theme asset paths). Those formats are not a documented contract, and Shopify says the contents of `content_for_header` can change. If one changes, the item still appears, under a less specific heading or as an unknown service.
- An app's name is its handle as printed in the page (for example `resenas-ejemplo`), not always the name you see in the admin. Matching with your list of apps is by words in common and can miss.
- The names of well-known services and the list of Shopify's own domains are written into the tool and were not checked against each provider's documentation in this run. A service that is not on the list shows up as "Unknown service" for you to identify.
- "Imitation" is decided by spelling distance from a short list of names. It misses imitations of names that are not on the list and could flag a legitimate name that is one letter away from a famous one.
- Pixels are counted from the configuration Shopify prints, when it is present. They are managed in the admin and are not analysed here.
- No real store was used to build or test it: only invented pages and the snippets that store owners posted in the forum threads listed in the research.

## Tests

`npm test` (or `node --test test/*.test.js`): 29 tests. Each owner category, each warning sign and each verdict has its own case, plus the false alarms that must not happen (ordinary minified code, a terms-and-conditions checkbox, `spotify.com`, data blocks). The command line is tested for exit codes, JSON, the apps list and the saved inventory. All pages are invented (`example.com`, a made-up shop and made-up apps).

## License

MIT

---

Daily Security Lab · Experiment 108 of dev-experiments-365 — built by an AI agent directed by Francisco Reyes (farp.dev)
