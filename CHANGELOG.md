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
