# AoE II Hotkey Practice — Product Specification

## 1. Product summary

The product is a static web-based hotkey practice tool for Age of Empires II. A user selects a default hotkey mapping or loads their own mapping, selects a built-in or locally saved custom drill, chooses a difficulty, and practices the drill using the selected hotkeys.

The practice experience is text-based. Sequences can mix keyboard hotkeys and clicks in numbered UI zones. The application measures whether the user completes the expected steps accurately and whether each sequence is completed within its difficulty-specific target time.

The website will be deployed on Cloudflare. Vite with TypeScript is the implementation stack. Vite is used only for development and building; the deployable website is the plain static output generated in `dist/`.

## 2. Current user flow

1. The user selects the default AoE II hotkeys or uploads their own hotkey mapping.
2. The user chooses a built-in or saved custom drill on the home page. Drill creation, upload, editing, and export are accessed through the separate `Drills` page.
3. The user chooses a difficulty level.
4. The user starts the drill.
5. The application presents the active sequence and listens for keyboard or click input as required by the active step.
6. The application shows the active step and the steps already completed.
7. The application records speed and accuracy while the user completes each sequence once in authored order.
8. The user can pause or exit the drill.
9. The application stops when the final sequence is completed or when the total drill time expires, whichever happens first, and reports the session statistics.

Custom drills are stored locally in the browser. No drill is uploaded to a server.

## 3. Drill structure

A drill contains:

- a stable identifier;
- a name;
- a total drill time; and
- multiple sequences.

Each sequence contains:

- a stable identifier;
- an ordered list of steps; and
- one target sequence time for each supported difficulty.

Each step contains:

- a step type;
- either a logical AoE hotkey action or a numbered click zone; and
- the failure handling to apply if the user's input is incorrect.

A step may also contain an optional `tip` string that is shown as an explanation during practice.

Logical hotkey actions are resolved through the user's uploaded hotkey mapping. Drill data does not store the user's physical keys.

Every drill has exactly 20 numbered click zones in one fixed 5-column by 4-row layout on the practice surface. Each click step identifies which numbered zone must be clicked. Custom-drill authors cannot reposition the zones or change their number.

## 4. Difficulty levels

The application supports the Age of Empires II AI difficulty names, plus an additional `Pro` difficulty:

1. Easiest
2. Standard
3. Moderate
4. Hard
5. Hardest
6. Extreme
7. Pro

Difficulty determines the allowed completion time for each full sequence. It does not change the steps in the sequence.

## 5. Drill data format

Drills use JSON. A sequence uses this shape:

```json
{
  "id": "build-house",
  "sequence": [
    {
      "type": "hotkey",
      "action": "select_villager",
      "onFailure": "wait"
    },
    {
      "type": "hotkey",
      "action": "open_economic_buildings",
      "onFailure": "restart_sequence"
    },
    {
      "type": "hotkey",
      "action": "build_house",
      "onFailure": "restart_sequence"
    },
    {
      "type": "click",
      "zone": 8,
      "onFailure": "wait"
    }
  ],
  "targetTimeMs": [4500, 3800, 3200, 2600, 2100, 1700, 1300]
}
```

The positions in `targetTimeMs` always use this fixed difficulty order:

| Array index | Difficulty |
| ---: | --- |
| 0 | Easiest |
| 1 | Standard |
| 2 | Moderate |
| 3 | Hard |
| 4 | Hardest |
| 5 | Extreme |
| 6 | Pro |

Every sequence must provide exactly seven target times. Each value is the allowed completion time, in milliseconds, for the full sequence at the corresponding difficulty.

### Complete custom-drill file

A custom drill uses this top-level JSON shape:

```json
{
  "schemaVersion": 1,
  "name": "House Placement",
  "description": "Practice villager building-placement sequences",
  "totalTimeMs": 60000,
  "sequences": [
    {
      "id": "build-house-left",
      "name": "Build House Left",
      "sequence": [
        {
          "type": "hotkey",
          "action": "open_economic_buildings",
          "tip": "Open the villager economic-buildings menu.",
          "onFailure": "wait"
        },
        {
          "type": "hotkey",
          "action": "build_house",
          "onFailure": "restart_sequence"
        },
        {
          "type": "click",
          "zone": 1,
          "onFailure": "wait"
        }
      ],
      "targetTimeMs": [4500, 3800, 3200, 2600, 2100, 1700, 1300]
    }
  ]
}
```

Custom-drill validation requires:

- `schemaVersion` to be `1`;
- a non-empty drill `name`;
- no top-level drill `id`; browser-local IDs are not accepted in portable custom-drill files;
- a positive `totalTimeMs`;
- at least one sequence;
- a unique, non-empty `id` and a non-empty `name` for every sequence;
- at least one step in every sequence;
- exactly seven positive integer values in every `targetTimeMs` array;
- every hotkey step to reference a logical action supported by the application;
- every click step to reference a fixed click-zone number from `1` through `20`; and
- no per-drill click-zone layout data.

### Hotkey step

```json
{
  "type": "hotkey",
  "action": "build_house",
  "onFailure": "restart_sequence"
}
```

The step completes when the user enters the hotkey mapped to the logical action.

### Click step

```json
{
  "type": "click",
  "zone": 8,
  "onFailure": "wait"
}
```

The step completes when the user clicks the specified zone. Clicking a different zone is an incorrect try and applies the step's `onFailure` behavior.

When a click step is active, the required zone is marked directly on the practice surface with:

- a large `X` centered inside the target zone; and
- the target zone number displayed immediately below the `X`.

For example, a step targeting zone `8` displays a large `X` in zone 8 with `8` beneath it.

Zones are numbered from `1` through `20`.
Their 5-column by 4-row positions are defined once by the application and are not part of built-in or custom drill data. Click steps store only the required zone number.

## 6. Step failure handling

Failure handling is configured independently for every step using `onFailure`.

### `wait`

When the user enters an incorrect hotkey:

- the try is recorded as incorrect;
- the same step remains active; and
- the application waits for the correct hotkey.

The sequence advances only after the user enters the correct hotkey for that step.

### `restart_sequence`

When the user enters an incorrect hotkey:

- the try is recorded as incorrect;
- the current sequence attempt is restarted from its first step;
- the first step becomes active; and
- the completed-step display is reset for the new sequence attempt.

Attempts recorded before the restart remain part of the session statistics.

The sequence timer continues when `restart_sequence` is triggered. A restart does not erase time already spent on the sequence.

## 7. Timing

The application tracks two different times.

### Total drill time

- Each drill defines a total drill time.
- The total drill timer begins when the drill starts.
- The total drill time is a maximum session duration, not a repetition duration.
- When the total drill time expires, the drill stops immediately.
- If the timer expires during a sequence, that incomplete sequence does not continue.
- Completing the final authored sequence stops the drill immediately without waiting for the total drill time to expire.

The initial built-in drill lasts 137 seconds. This is greater than the 136,500 ms combined Easy target time for all 21 sequences.

### Target sequence time

- Timing begins when a sequence becomes active and is ready for input.
- Timing ends when the sequence is completed.
- The measured sequence time is compared with that sequence's target for the selected difficulty.
- Every sequence has its own seven difficulty-specific target times.
- Expiration of the target sequence time causes no automatic action.
- A user may finish a sequence after its target time; the result is recorded as slower than the target.
- Expiration of the total drill time stops an unfinished drill; completing the final sequence also stops the drill.

## 8. Attempts and accuracy

Each evaluated keyboard hotkey input or click-zone selection is one try.

- A try matching the hotkey action or click zone expected by the active step is correct.
- Any other evaluated hotkey input is incorrect.
- Clicking a zone other than the active step's target zone is incorrect.
- Incorrect tries follow the active step's configured failure handling.

Accuracy is calculated as:

```text
correct tries / total tries
```

The displayed percentage is:

```text
(correct tries / total tries) × 100
```

## 9. Initial built-in drill

The initial built-in drill practices Villager building-construction hotkeys.

During the drill:

1. The application presents a building target.
2. Only the final four sequences (Stable, Stone Wall, Town Center, and University) begin with `Go to Next Idle Villager`. This step uses `wait` failure handling.
3. All earlier sequences begin directly with the correct building-menu hotkey.
4. The user opens the correct building menu. This step uses `wait` failure handling.
5. The user chooses the requested building. This step uses `restart_sequence` failure handling.
6. The user clicks the marked placement zone. This step uses `wait` failure handling.
7. When the sequence is resolved, the application presents the next authored building target and placement zone.
8. The drill stops after every authored sequence has been completed once or when the total drill time expires.

The drill draws from these building targets:

- Archery Range
- Barracks
- Blacksmith
- Castle
- Dock
- Farm
- Gate
- House
- Lumber Camp
- Market
- Mill
- Mining Camp
- Monastery
- Outpost
- Palisade Gate
- Palisade Wall
- Siege Workshop
- Stable
- Stone Wall
- Town Center
- University

The built-in drill uses a 5-by-4 surface containing 20 click zones. The placement zone is selected when each sequence begins.

All built-in sequences use these target times in the fixed difficulty order:

```json
[6500, 5200, 4200, 3300, 2600, 2000, 1500]
```

## 10. Practice screen

The practice screen includes:

- drill name;
- total drill time remaining;
- current sequence progress;
- current sequence time and target time;
- every step in the active sequence;
- a visual distinction between completed, active, and pending steps;
- the drill's authored click-zone surface when the active sequence contains click steps;
- a large `X` centered in the target zone for the active click step;
- the target zone number immediately below the `X`;
- a waiting-for-input state;
- a Pause control that stops the timers and input handling without covering the practice screen with an overlay;
- an Exit control; and
- a text version of the user's hotkey mapping on the right side.

Conceptual sequence display for one of the final four sequences:

```text
✓  SELECT VILLAGER                 Completed
→  OPEN ECONOMIC BUILDINGS        Active
   BUILD HOUSE                    Pending
```

When failure handling advances or restarts a sequence, the active and completed step states update immediately.

For a click step, the active-step display identifies the required zone, for example `CLICK ZONE 8`, while the practice surface marks that zone with the large `X` and number.

## 11. Session statistics

The application reports:

- correct tries;
- total tries;
- accuracy;
- measured sequence completion times; and
- whether completed sequences met their selected difficulty targets; and
- one row for every sequence defined by the drill.

Every sequence row displays its selected-difficulty target time. A completed sequence displays its best completion time and whether that time met the target. A sequence not completed during the session displays `Not completed` and no completion time.

## 12. Hotkey mapping

The user can select the built-in AoE II: Definitive Edition default mapping or upload their own Age of Empires II hotkey mapping. The application uses that mapping to resolve drill actions into the keyboard inputs expected from that user.

The current version accepts binary `.hki` and `.hkp` files. Parsing happens entirely in the browser. A modern AoE II profile uses the profile-level `Hotkeys.hkp` together with `Base.hkp`. The interface accepts both files together or one at a time and merges them into one mapping. A profile contains at most two files, each uploaded file is limited to 64 KiB, and decompressed hotkey data is limited to 512 KiB per file.

## 13. Input scope

The current version supports:

- keyboard hotkey actions; and
- mouse clicks in numbered UI zones defined by the drill.

Every drill has exactly 20 click zones in the same fixed 5-column by 4-row layout. A drill does not need to contain click steps, but its definition still includes all 20 zones. Arbitrary mouse gestures and clicks outside the numbered practice zones are not drill steps.

## 14. Drill library, creation, upload, editing, and export

### Header navigation

The persistent site header contains a `Drills` navigation link. This is the only entry point for creating, uploading, editing, and exporting drills.

The `Drills` link is styled as a deliberate header-navigation item in the same visual language as the AoE Hippo header: it is aligned with the existing brand/header content, has clear hover and keyboard-focus states, and has a visible active state while the user is on the Drills page. It must not appear as an unstyled text link or as a setup-form control.

The home/setup page does not display `Create custom drill` or `Upload drill JSON` controls.

### Drills page

The `Drills` header link opens the dedicated drill-library route at `/drills`.

The production build emits Cloudflare Pages static HTML entry files for `/` (`index.html`), `/drills` (`drills.html`), `/drills/create` (`drills/create.html`), `/drills/edit` (`drills/edit.html`), and `/privacy` (`privacy.html`). It also emits a top-level `404.html` so unknown routes return the static not-found page instead of triggering Cloudflare Pages' automatic SPA fallback. Cloudflare serves the page files at their extensionless URLs. Navigation between these pages performs normal document navigation. Deployment does not depend on an SPA catch-all rewrite.

Every generated HTML entry is a distinct document containing its own page title, headings, navigation, footer, and meaningful initial page content. The build must not copy the root HTML shell into other routes. `privacy.html` contains its complete legal content and works without JavaScript. Interactive page scripts may enhance controls and load browser-local data, but the existence and identity of a page do not depend on an empty application shell.

Application scripts must not contain HTML template strings or insert or parse HTML strings at runtime. `<template>` elements and the `innerHTML`, `outerHTML`, `insertAdjacentHTML`, `document.write`, `DOMParser`, and `createContextualFragment` APIs are not used. Stable page structure and initial content are authored in the HTML entry files. Interactive state changes use element properties, text content, class and attribute updates, and safe DOM node creation where browser-local or session-generated content is required. Inline scripts, inline style blocks, inline `style` attributes, and runtime inline-style assignments are prohibited.

The deploy output contains a permissive root `robots.txt` that references `https://aoe2hotkey.vejak-app.workers.dev/sitemap.xml`. The sitemap lists the canonical public pages at `/`, `/drills`, `/drills/create`, and `/privacy`; it excludes the state-dependent edit route and the 404 page. Content-hashed files under `/assets/` receive long-lived immutable browser caching; HTML documents do not receive that cache policy.

On desktop, the page uses two sections:

- the left section lists every available drill, including built-in drills and locally stored user-added drills; and
- the right section contains the `Create drill` and `Upload drill` actions.

On narrow screens, the two sections stack vertically while preserving the drill list before the create/upload actions.

Each drill entry identifies:

- drill name;
- description;
- total drill time;
- number of sequences; and
- whether it is `Built-in` or `Custom`.

Built-in drills are read-only. They do not display an edit action.

Clicking any drill entry returns to the home setup page with that drill selected. The drill ID is carried in the home-page URL so the selection survives the normal multi-page document navigation.

Creator-made and uploaded drills are user-added custom drills. Each custom-drill entry displays a compact `...` menu containing exactly:

- `Edit drill`;
- `Delete drill`; and
- `Export JSON`.

Using the menu does not select the drill. Built-in drills do not display this menu.

The right section presents `Create drill` and `Upload drill` as distinct, properly styled actions with short text explaining what each action does. Upload uses a file picker accepting the custom-drill JSON format from Section 5. These controls exist only on the Drills page.

### Custom drill creator page

The `Create drill` action on the Drills page opens the dedicated creator route at `/drills/create` with a new empty drill. Editing a custom drill opens `/drills/edit?drillId={drill-id}`. Browser Back and the creator's `Back` control return to the previous route without losing browser-history order.

The creator allows the author to define:

- drill name;
- drill description;
- total drill time;
- one or more sequences;
- the name of every sequence;
- the ordered steps in every sequence;
- whether each step is a hotkey step or click step;
- the logical action for each hotkey step;
- the numbered zone for each click step;
- `wait` or `restart_sequence` failure handling for every step; and
- all seven target sequence times for every sequence.

The application generates a friendly browser-local drill ID from the drill name for creator-made and imported drills. For example, `Villager Building Placement` becomes `villager-building-placement`. If that ID already exists, the application appends `-2`, `-3`, and so on. Sequence IDs remain part of the portable drill data.

The creator displays one sequence at a time. The author moves between sequences with `Prev sequence` and `Next sequence`, and adds another with `Add another sequence`. A sequence and each of its steps can be deleted.

Each sequence displays seven target-time inputs in the fixed difficulty order from Section 4. Each step displays its resolved physical hotkey or numbered click zone, an optional tip input, its failure handling, and a delete action.

`Add hotkey step` immediately opens a searchable action dialog. While the complete action catalogue and resolved bindings are being prepared, the open dialog displays a loading spinner. Search matches both the action text and the physical hotkey resolved from the currently selected hotkey profile. Choosing a result adds the logical action to the sequence; the drill never stores the physical key.

The hotkey-step dialog exposes the complete named AoE II: Definitive Edition action catalogue, including selection, navigation, control-group, unit-production, technology, construction, economy, military, camera, and interface shortcuts. It is not restricted to the actions used by built-in drills. Every additional string ID found in a newer uploaded profile is also exposed as an action using that stable numeric ID, even when the local catalogue does not yet have a human-readable name for it.

`Add click zone` adds a click step and expands an inline numbered selector. The selector contains all zones `1` through `20` in the fixed 5-column by 4-row layout. Choosing a number assigns that existing drill zone to the step and collapses the selector to the step summary.

The creator does not display a separate click-zone layout editor. Authors cannot reposition, add, remove, or renumber zones.

The creator prevents saving a drill that does not satisfy the custom-drill validation rules in Section 5. A successfully saved drill becomes available in the drill list, becomes available in the drill selector on the setup page, and returns the user to the Drills page.

### Editing a custom drill

Selecting `Edit drill` on a creator-made or uploaded drill opens the same custom-drill creator with the complete existing drill prefilled, including its name, description, total time, sequences, steps, tips, failure handling, and target times. The edit-page header also displays `Delete drill`; the create page does not.

Saving an edited drill updates the existing locally stored drill under the same stable drill ID. It does not create a duplicate. Cancelling or using `Back` returns to the Drills page without changing the stored drill.

Built-in drills cannot be edited.

### Deleting a custom drill

Selecting `Delete drill` asks for confirmation. Confirming removes the custom drill from browser storage, the Drills page, and the setup-page drill selector. If the deleted drill was selected, the application selects the first built-in drill. Cancelling leaves the drill unchanged.

Built-in drills cannot be deleted.

### Custom drill JSON upload

The right section of the Drills page provides the `Upload drill` action. The user selects one JSON file using the complete custom-drill shape from Section 5.

The application validates the complete file before making it selectable. If validation fails, the application shows the validation error on the Drills page and does not add or partially save the drill. A successfully uploaded drill appears in the left drill list and becomes available in the same setup-page selector as built-in and creator-made drills.

### Custom drill JSON export

Selecting `Export JSON` on a user-added drill downloads that drill as a `.json` file using the complete custom-drill format from Section 5.

The exported data contains all portable editable drill data but does not include the browser-local drill ID. The filename is derived from the drill name in a filesystem-safe form and ends in `.json`. Export happens entirely in the browser; the drill is not sent to a server.

Built-in drills do not display `Export JSON`.

### Local persistence

Creator-made and uploaded custom drills remain local to the browser:

- the application stores valid custom drills in browser `localStorage` when it is available;
- saved custom drills are restored after a page reload;
- if `localStorage` is unavailable or rejects the write, the application keeps the drill in memory for the current page session;
- the interface does not claim persistence beyond the current session when only memory storage is available; and
- custom drill contents are never sent to a server.

Built-in drills are not written to `localStorage`.

## 15. Privacy and beta terms

Every page footer links to one combined `/privacy` page using the visible label `Privacy & Beta Terms`. The footer also includes a `Feedback` email link and identifies the site as an unofficial fan-made tool. The email address is present only in the link destination and is not displayed as page text.

The privacy section states only the application's actual data behavior:

- selected hotkey and custom-drill files are processed in the browser and are not uploaded by the application;
- only custom drills are persisted in browser `localStorage`;
- uploaded hotkey files, active progress, difficulty choices, and other settings remain session-only;
- local custom drills remain until deleted through the application or browser site-data controls;
- the site has no accounts, advertising, or non-essential cookies;
- Cloudflare hosts and secures the site and may process basic technical request data needed to deliver and protect it; and
- Cloudflare Web Analytics is used for aggregate visit and performance measurement and is identified as Cloudflare's cookie-free, privacy-first analytics service.

The beta-terms section narrowly states that the free beta is provided as-is, may contain bugs or incorrect mappings, that browser storage is not a permanent backup, that imported third-party drills are not reviewed or endorsed by the site, and that the beta may change or be removed.

The disclaimer identifies the site as an unofficial fan-made tool with no affiliation or endorsement by Microsoft, World's Edge, Forgotten Empires, or the Age of Empires team. It includes Microsoft's required Game Content Usage Rules notice and a link to those rules.

The page contains no broad liability, data-security, permanence, or service-availability promises beyond the behavior defined in this specification.

## 16. Explicitly out of scope

- Sound or audio feedback
- Product features not described in this specification
