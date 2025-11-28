## v0.0.20 (2025-11-28)
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
