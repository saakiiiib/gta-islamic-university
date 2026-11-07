# English/Bangla place search

Task 19 enriches existing map anchors with separate English/Bangla display names and current/historical aliases. Raw name, nameTag, typed source IDs and positions are preserved. Bangla-only OSM names are imported, and both raw language tags remain searchable even outside the landmark registry. Registry names join only unambiguous typed building identities; no unplaced 2026 tower/monument label is synthesized.

Use **Find a place** in the view toolbar. Opening it enters the existing inspection mode and pauses simulation. Type English or বাংলা, use arrows/Enter or tap a result. Selection aims the inspection camera at its existing anchor; the player and vehicle stay in place. Escape hides the search, and the existing View/Back control returns to gameplay. Results include historical aliases (including Grarage) while labels and nearby-location display use current registry names.

The local search uses NFC normalization, stable ranking and at most eight displayed results. Its combobox/listbox has explicit bilingual labels, keyboard and IME handling, live status and text-only rendering. Typing clears held controls, key releases still reach input cleanup, pause hides the panel, and there are no network calls. Windows Nirmala UI/Vrinda and platform Noto Sans Bengali fallbacks use system fonts; no unlicensed font assets are added. Mobile layout uses 44px controls and a bounded scrolling result list.

World labels reserve more height for two scripts and avoid the search panel. No duplicate anchors are created. Actual plaque dates/lettering remain historical evidence; this feature is an in-game navigation aid, not a fabricated present-day physical sign. Current plaque surveys remain pending.

Validation: focused name/search/map/appearance checks, search DOM/input tests and standard preparation/build. Interactive desktop/mobile visual and installed-font review is still pending without a controllable game browser.
