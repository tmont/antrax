# Atari 7800 Sprite Editor

A graphical sprite editor for the Atari 7800.

**Features:**
- Zooming
- Grid
- Customizable width/height
- Customizable pixel size

**Eventually:**
- Color palette management
- Data import/export
- Code gen
- Lo/hi-res mode switching
- Multiple sprites
- Animations


## Prerequisites
1. [Bun](https://bun.com/docs/installation)
2. [Dart Sass](https://github.com/sass/dart-sass/releases/tag/1.93.2)
    - install it to `.dev/` such that the path to the `sass` executable is
      `.dev/dart-sass/sass`

## Development

1. `bun install`
2. `bun run build`
3. In another terminal, `bun run start`
4. In another terminal, `bun run sass`
5. Visit http://localhost:11000/
