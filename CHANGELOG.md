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
