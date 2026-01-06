## v1.0.1 (2026-01-06)
- Added MIT license to source code
- Added link to GitHub in "About" section in help docs

## v1.0.0 (2026-01-05)
- New favicon
- Added OpenGraph tags
- Added version info to "About" section in help docs

## v0.9.1 (2026-01-02)
- Relative time text now updates in real time! ooh!
- Fixed touch support for RGB color picker
- Transparent pixels are now handled properly when drawing
  shapes/lines and moving selections
- Fixed a bunch of issues with color conversion between display modes.
  Surely it's now fixed forever.
- Updated example projects

## v0.8.0 (2026-01-01)
- Fixed inability to use modifiers (e.g. `Ctrl+A`) inside a text input
- `Undo`/`Redo` overflow menu items update in real-time when a keyboard
  shortcut is used
- Current project and editor state is saved to `localStorage` every 10
  seconds. An option to reload this saved state becomes available when
  the project is empty.
- Added _Ninja Golf_ example project and enhanced the "first run"
  splash screen

## v0.7.0 (2025-12-29)
- Canvas no longer receives mouse events when in Pan mode
- Color overhaul:
    - Display mode __None__ now allows arbitrary colors using an 
      HSV picker
    - Switching to a different display mode will update the
      entire palette set to the closest matching colors available
- Added __NES__ display mode, which forces pixel dimensions to
  `8x7` and only allows colors viewable on the NES
- Added __PICO-8__ display mode, which is restricted to the 16
  allowed colors plus the "hidden" ones
- Fixed touch events not being detected properly
- Fixed scroll position when navigating in the help modal via
  the back/forward buttons
- The default "red" color now has a hue of `0` instead of `359`

## v0.6.0 (2025-12-24)
- Fixed keyboard shortcuts not working due to bad modal state
  detection
- Rotate moved out of the overflow menu and into the gutter
- Added the rest of the help content
- Added keyboard shortcuts for flip and crop
- Minor restyle of the selection actions

## v0.5.0 (2025-12-23)
- Added support for Command/Option keys on Mac
- Restyled shortcut modal
- Added "pan" draw mode
- Added "Select All" and "De-select All" menu items to selection 
  action overflow
- Flipping with nothing selected will now flip the entire canvas,
  similar to how rotate behaves
- Added zoom controls to animation and image export modals
- Added Ctrl+Shift+X shortcut for showing animation dialog
- Added some content to help modal

## v0.4.1 (2025-12-16)
- Updated _Dragon Warrior_ example project
- Fixed non-deterministic ordering of groups when exporting a spritesheet
- Use previously loaded filename when saving
- Fixed empty project message being useless on smaller screens
- Cloning an object will inherit the original's name
- Added viewport meta tags for mobile

## v0.4.0 (2025-12-16)
- Fixed preview objects in animation dialog not using full width
- Bullseye icon in top gutter now does something when you click on it
- Added object filter to animation form
- "New project" menu item now creates a new project instead of being disabled
- Added ability to re-order groups the same you can re-order objects
- Can now re-order groups and objects on mobile
- Fixed my own confusion about which way "clockwise" goes
- Added example projects and a "first-run" experience
- Added sweet Atari 7800-style gradient to "Antrax" text

## v0.3.1 (2025-12-16)
- Fixed `Esc` keyboard shortcut not deselecting if a modal was opened
  previously

## v0.3.0 (2025-12-15)
- Implemented the __move__ draw mode (shortcut `M`)
- Pasting onto the canvas now pastes automatically at `[0, 0]` and goes into
  __move__ draw mode with pasted content selected
- Transparent checkerboard pattern is now always square and does not scale
  with the zoom level
- Added "Debug" menu action for editing an object's raw pixel data structure
- __Fill__ mode no longer fills off-canvas pixels that remain after a resize
- Fixed thumbnails sometimes going blank and not updating properly
- Modal dialogs will no longer go offscreen on small windows
- Eye-dropper color selector can now select uncolored pixels (will select
  color 0)
- Image export modal now shows dimensions, size and zoom level
- All popovers are now closed whenever a modal is opened
- Fixed a "clear" action not being undo-able if the canvas has not been 
  activated (e.g. after being loaded from an external file)
- A warning is now shown when exporting ASM if the sum of the byte widths
  exceeds 256
- Added object filter to image export
- Added option to prepend group name to object labels when exporting ASM
- Added overflow menu in top gutter for active canvas selections
    - Contains _Undo_, _Redo_ and _Rotate_
- Implemented _rotate_ action for rotating the active canvas 90° 
  counter-clockwise

## v0.2.2 (2025-12-09)
- Fixed modal dimensions shifting when changing form values in animation
  and image export dialogs
- Object count is now shown in the palette set dropdown for each 
  palette set
- Fixed object info in the sidebar not updating when a palette set 
  name is changed
- Added group/object filter to ASM export
- List of colors now scrolls and the bottom gutter always remains visible
- Very rudimentary support for touch events (enough that you can draw
  and things don't appear totally broken)

## v0.2.0 (2025-12-08)
- New zooming algorithm that removes anti-aliasing at small zoom sizes
- Zoom levels are now fixed instead of simple increments/decrements
- Zoom level text input is now a range slider
- Added canvas location to top gutter; click to bring canvas into view
    - Helpful if the canvas disappears after a good zooming session
- Removed `0-9` keyboard shortcuts to set zoom level
- `-`/`_` and `=`/`+` now increment/decrement the zoom level

## v0.1.4 (2025-12-05)
- Fixed style issues with modal title

## v0.1.3 (2025-12-05)
- Added options for image export
    - Background color, uncolored pixel behavior, orientation, padding and pixel size
- Export spritesheet for whole project
- Export ASM for whole project
    - Will also now export multiple palettes
- Minor sidebar UI tweaks, removed external "clone" button

## v0.1.2 (2025-12-03)
- ASM object labels are now PascalCase instead of a simple concatenation
  (e.g. "foo bar" -> "FooBar" instead of "foobar")
- ASM export options are remembered (including across save/load cycles)
- Fixed scrolling issue with frame list in animation modal
- You can now switch between certain display modes even if the canvas is not empty
    - `160B` <-> `320C`
    - `160A` <-> `320A` <-> `320D`
- Added overflow menu for the project
- Project name is now editable
- Added menu action to create an empty group
- Added menu action to clone an item into a new group
- Added the currently loaded file and project stats to the sidebar
- Pressing `Esc` when focused in an input will now hide popovers (but not de-select)

## v0.1.1 (2025-12-02)
- fixed changelog formatting

## v0.1.0 (2025-12-02)
- Added palette set management (add/delete/switch)
- App now loads custom fonts (Noto Sans and Source Code Pro)
- Added `0.1` granularity to zoom level, and manual text input by clicking
  on the magnifying glass in the bottom gutter

## v0.20.0 (2025-11-28)
- Active color(s) are now shown as "active" in the palette set UI
- Selection draw mode:
    - Added horizontal flip (in most display modes), vertical flip,
      crop, copy, paste and delete selection actions
    - Keyboard shortcuts for _Select all_ (`Ctrl+A`) and _De-select all_
      (`Ctrl+Shift+A`)
    - Added selection size indicator in UI
- Off-canvas drags are now detected in `ellipse`, `ellipse-filled`, `select`,
  `rect`, `rect-filled` and `line` draw modes
- Selection is now significantly less janky
- Fixed undo not working in certain cases (e.g. Clone -> Clear)
- Fixed some weirdness with groups not being properly deleted
- Added top gutter to UI, shifted some other parts of the UI around
- Removed some unnecessary whitespace in comments for exported ASM

## v0.0.19 (2025-11-24)
- Rewrote almost everything
    - Saves should be theoretically backward-compatible
- Object info in sidebar is now always visible
- Show object list in animation modal
- Can reorder objects within groups, and move them between groups
- FPS for animation now goes in increments of `0.5`
- Added confirmation dialogs for deletion actions
- Fixed long names of things without spaces not being ellipsis-ized
- Improved thumbnail generation
- Scrollwheel inertia is now significantly less infuriating when selecting
  colors or zooming
- Fixed "Clear" actions behaving strangely with the undo stack
- Added "Add object" item to group overflow menu
- Fixed twice reversed output in ASM export
- Pad shorter objects with zeroes when exporting ASM as a group
- Implemented _very_ rough version of rectangular selection. Right now the
  only thing you can do is Ctrl+C to copy selected pixels, and then Ctrl+V
  to paste it in another canvas (with or without a selection) or the same
  canvas.

## v0.0.18 (2025-11-20)
- Groups
    - Can edit group name
    - Can export all objects together
    - Can view animation of group's objects
    - Can delete a group and all its objects
    - Can export all of a group's objects as a combined spritesheet
- Groups are now collapsible in the sidebar
- Active object's palette is now highlighted in the header
- Fixed active object palette info in sidebar not updating when palette changed
- Removed trailing semicolon in ASM export
- Disabled keyboard shortcuts while a modal is open
- Dropdowns/popups now detect the edge of the screen and flip the opposite direction
- Fixed corruption when loading data that had previously deleted objects in it. This
  should be backward compatible, so loading a corrupted save should fix itself
  automatically.
- Updated favicon to MEEF

## v0.0.17 (2025-11-19)
- Added detail level option to ASM export
- Fixed color order (again) for `320B`
- Added 0.5x zoom level
- Tweaked initial position and zoom level of canvas
- Prompt for filename when saving
- Changed header/palette exported code to be comments instead of code

## v0.0.16 (2025-11-17)
- Drawing modes
    - Basic: Draw/Erase/Fill/Eye dropper
    - Shapes: Rectangle/Ellipse/Filled Rectangle/Filled Ellipse/Line
- Removed `P`/`C` keyboard shortcuts for focusing pixel/canvas width inputs
- Prevent toggling transparency in Kangaroo mode
- Use current display mode's first color as background in Kangaroo mode
- Updated favicon
- `ColorPicker` is now treated like a singleton which improves memory
  consumption by 10x
- Display list code generation uses the object's label instead of the
  address label/offset
- Fixed load mechanism on Windows, and added better error handling in general

## v0.0.15 (2025-11-15)

- Keyboard shortcut: `X` to open "Export ASM" modal (if supported by current
  object's display mode)
- Keyboard shortcut: `Shift+X` to export active object as image
- Fixed `320C` ASM export (colors were in wrong order)
- `Alt+Click`/`Middle-click` to select color at pixel
- Image export checkerboard now matches color in editor
- Added kangaroo mode toggle for `displayMode!=none`
    - Keyboard shortcut: `K`
- Keyboard shortcuts now fire even if focused on other elements (e.g. checkboxes)
- Default browser behavior no longer overridden if `Ctrl` is held (i.e. `Ctrl+C`
  now actually copies text instead of doing nothing)
- Canvas width is now clamped to the maximum supported by the current display mode
  (with `none` having a maximum of 256)
- Right-clicking on the canvas no longer interacts and instead will execute default 
  browser behavior

## v0.0.14 (2025-11-14)
- Implemented codegen for palettes/DL entries
- Support for using a label as an address offset during ASM export
- Implemented smarter zooming algorithm
- Re-ordered 320B colors to fix some export inaccuracies
- Fixed binary formatting in ASM export if the value >256
- Can now use W/S/Up/Down to select colors
- Can now use the number keys to select a zoom level
- Palette info in sidebar is hidden if `displayMode=none`
- Fixed some alignment issues in the UI

## v0.0.13 (2025-11-12)
- Implemented codegen for remaining display modes (except `none`)
- Added image export
- Improved performance for large canvases (kind of)
- Added row/column headers to color picker
- Added global option to toggle transparent checkerboard pattern

## v0.0.12 (2025-11-12)
- Implemented codegen export for 160A, 160B and 320A
- Added toasts
- Added SSL cert

## v0.0.11 (2025-11-11)
- Canvas is filled transparent instead of background color by default
- Erasing a pixel now colors it transparent instead of background color
- Transparent pixels now use a checkerboard pattern instead of diagonal texture
- Scrollwheel now selects adjacent color instead of zooming
- Canvas sidebar colors now update when background color is changed
- Fixed canvas width clamping for hires modes
- Fixed display mode colors
    - `none`: added `BG`
    - `320B`: masks colors to palettes 0 or 4
    - `320C`: was a placeholder, now it's not

## v0.0.10 (2025-11-11)
- Atari 7800 display mode support
    - `none` is just free draw
    - The others are almost certainly inaccurate in some way, but they
      are functional
    - Pixel dimensions inputs are disabled when __display mode__ is not `none`
    - Canvas dimensions are clamped to only allowed multiples when
      __display mode__ is not `none`
- Individual palettes are now assigned directly to objects (when __display mode__
  is not `none`)
- Palettes in the header now open color picker on click (no more Shift+click)
- Added canvas sidebar showing currently active object information
- Colors are selected from the new canvas sidebar
- Display mode can be selected for an object
    - Can only change display modes if the canvas is empty
- Clearing an object now clears offscreen pixels
- Transparent pixels have a texture to them
- Zoom now goes in increments of `0.5x`, Shift+mousewheel goes in increments
  of `1x`. New minimum of `1x`.
- Cloned objects are now inserted directly after the original, instead of
  at the end of the group
- Added changelog link
