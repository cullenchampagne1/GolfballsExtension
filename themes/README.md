# Golfballs Admin — Chrome browser themes

One static **Chrome theme per extension variant**. These recolor the parts of
the browser the extension *can't* touch from code — the window frame, tabs,
toolbar, omnibox (address bar), bookmarks bar, and new-tab page — to match the
in-app theme you picked in the extension's header dropdown.

Folders (load the one that matches your in-app theme):

| Folder            | In-app theme |
|-------------------|--------------|
| `themes/dark`     | Dark         |
| `themes/midnight` | Slate        |
| `themes/light`    | Light        |
| `themes/cream`    | Cream        |
| `themes/nord`     | Nord         |
| `themes/dracula`  | Dracula      |
| `themes/rose`     | Rose         |
| `themes/tokyo`    | Tokyo Night  |

## Apply / switch

1. Open `chrome://extensions`, turn on **Developer mode** (top-right).
2. Click **Load unpacked** and pick the variant folder (e.g. `themes/tokyo`).
   Chrome applies it immediately.
3. To switch themes, just **Load unpacked** the next folder — Chrome only keeps
   **one theme active at a time**, so the new one replaces the previous.
   (To go back to no theme: `chrome://settings/appearance` → **Reset to default**.)

## Why it's per-folder and not automatic

Chrome themes are **static** — colors are baked into the manifest and there's no
API to change a theme at runtime, so a theme can't follow the extension's live
theme dropdown. Hence one prebuilt theme each, enabled manually.

## Regenerate

Colors are pulled from `src/ui/theme.css`. After changing tokens there:

```
node themes/generate-themes.mjs
```
