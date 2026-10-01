# Reading Highlighter

A Chrome extension that highlights links, titles, text, images, bold/code, list items, quotes and buttons on any page, each in its own color. It has light and dark color sets (5 colors each), a custom color picker, and a checklist to choose what gets highlighted.

## Project layout

```
reading-highlighter/
├── manifest.json
├── content.js      <- the highlighter script
└── content.css     <- highlight styles
```

> `content.js` is the `reading-highlighter.js` script. Rename it to `content.js` so it matches the manifest.

## Install (unpacked, from source)

### 1. Get the code

**Option A: clone with Git**

```bash
git clone https://github.com/<your-username>/<your-repo>.git
cd <your-repo>
```

**Option B: download a ZIP**

1. Open the repository page on GitHub.
2. Click **Code → Download ZIP**.
3. Extract the ZIP (right-click → *Extract All* on Windows, double-click on macOS).
4. Open the extracted folder and make sure you can see `manifest.json` directly inside it. If it is inside another nested folder, use that inner folder in step 4.

### 2. Open Chrome's extensions page

Go to `chrome://extensions` in the address bar. You can also use the menu: **⋮ → Extensions → Manage Extensions**.

### 3. Turn on Developer mode

Switch on the **Developer mode** toggle in the top-right corner of the page. Three new buttons appear: *Load unpacked*, *Pack extension* and *Update*.

### 4. Load the extension

1. Click **Load unpacked**.
2. Select the folder that contains `manifest.json` (select the folder itself, not a file inside it).
3. Click **Select Folder** (or **Open**).

"Reading Highlighter" now appears in your extensions list with no errors.

### 5. Pin it (optional)

Click the puzzle-piece icon in the toolbar, then click the pin next to **Reading Highlighter**.

### 6. Try it

Open or refresh any normal web page (pages that were already open before you installed the extension need a refresh). Links, headings and the other selected types are highlighted, and a floating button appears in the bottom-right corner. Click it to open the panel.

## Using it

- **Panel:** open with the floating button, close with the ✕.
- **Highlighting on/off:** the master checkbox at the top of the panel.
- **Light / Dark:** switch between the two color sets in the panel. Pick the one that suits the page you are reading.
- **Colors:** each type has 5 preset swatches for the current mode, plus a custom color box.
- **Checklist:** tick or untick Hyperlinks, Titles / Headings, Text, Images, Bold / Code, List items, Quotes and Buttons. **All** and **None** change every box at once.

### Keyboard shortcuts

| Shortcut | Action |
| --- | --- |
| `Alt + R` | Turn all highlighting on / off |
| `Alt + P` | Open / close the panel |
| `Alt + M` | Switch light / dark |
| `Alt + 1` … `Alt + 8` | Toggle each type in the checklist |

## Updating after code changes

1. Edit `content.js`, `content.css` or `manifest.json`.
2. Go to `chrome://extensions`.
3. Click the **reload** icon (↻) on the Reading Highlighter card.
4. Refresh the page you are testing on.

If you pulled new changes with Git, run `git pull` first, then follow the steps above.

## Troubleshooting

| Problem | Fix |
| --- | --- |
| "Manifest file is missing or unreadable" | You selected the wrong folder. Choose the folder that directly contains `manifest.json`. |
| "Could not load javascript 'content.js'" | The script is not named `content.js`, or it is not in the same folder as `manifest.json`. |
| Nothing is highlighted | Refresh the page. Chrome does not allow extensions on `chrome://` pages or the Chrome Web Store. |
| Doesn't work on a local `.html` file | On the extension's card, click **Details** and turn on **Allow access to file URLs**. |
| Panel is in the way | Close it with the ✕. Open it again with the floating button or `Alt + P`. |
| Colors look wrong on a page | Use `Alt + M` to switch between light and dark. |

## Notes

- The toolbar icon (`action` in the manifest) does nothing on its own. To make it toggle the highlighter, add a `background.js` service worker that sends a message to `content.js`, and register it in the manifest under `"background": { "service_worker": "background.js" }`.
- This works the same way in other Chromium browsers. Use `edge://extensions` in Edge or `brave://extensions` in Brave.
- Chrome may show a "Disable developer mode extensions" prompt on restart. Choose to keep them enabled.