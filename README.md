# Antrax

A web-based, dependency-free pixel art editor geared toward the Atari 7800.

![Antrax for generic pixel art](./docs/images/screenshots/main.png)

Main site: https://antrax.tmont.com/

Changelog: [CHANGELOG.md](./CHANGELOG.md)

## Features
### Editor features
- Zooming
- Grid
- Customizable canvas size
- Customizable pixel size
- Shape drawing (rectangle/ellipse/line)
- Select/copy/paste/move parts of the canvas
- Fill/Eye-dropper/Erase
- Save/load from/to external files 
- Automatic save+restore to `localStorage`
- Edit/manage multiple named graphics objects
- Clone existing graphics object
- Export to image/spritesheet
- View sprite animations
- Color palette management
- Lots of keyboard shortcuts
- Extensive in-app help documentation
- Touch support
- Horizontal/vertical flip
- Rotate

### Atari 7800-specific features
- Export object/header/palettes to ASM
- Color picker for all 256 supported colors
- Kangaroo mode support
- Switch between all display modes (160A/B, 320A/B/C/D)
- Color palette logic
- Object width is clamped to what the display mode supports

### Other features
- NES color palette (64 colors)
- PICO-8 color palette (8 + 8 "hidden" colors)

## Screenshots
<details>
<summary>Antrax screenshots</summary>

### Atari 7800 sprites
#### 160 display mode
![Antrax for 7800 sprites](docs/images/screenshots/pixel-art-7800-160.png)

#### 320 display mode
![Antrax for 7800 sprites](docs/images/screenshots/pixel-art-7800-320.png)

### Color picker
![Color picker with Atari 7800 supported colors](./docs/images/screenshots/color-picker.png)

### Export assembly
![Export graphics object to ASM](./docs/images/screenshots/export-asm.png)

### Export image
![Export graphics objects as spritesheet](./docs/images/screenshots/export-image.png)

### Keyboard shortcuts
![Keyboard shortcuts](./docs/images/screenshots/kbd-shortcuts.png)

### In-app help documentation
![Help documentation](./docs/images/screenshots/help.png)

</details>

## Development
This is started out as a sort of "I wonder if this will work?" situation and
then it kind of just kept snowballing. The codebase is a little hectic; there
are a few too many God objects, but refactoring stuff was not the name of the
game here. Nor was thinking ahead or designing stuff. I bolted things on
when it felt right. And it frequently felt right.

I deliberately made it free of dependencies, as such I invented my own
"component" architecture involving events.

All this to say, don't judge me based on this code. I was just having a
good time.

I don't even play the Atari 7800, I wrote this for someone else because
it sounded like fun.

### Brief explanation and pre-emptive rebuttal
Each "component"-type thing in `public/app/` has a vague kind of hierarchy.
"Child" components cannot directly invoke methods on their parent (because
they are unaware of their parent), they only emit events. So:
direct function invocation from parent→child, emit+listen to communicate
from child→parent.

```typescript
class Parent {
    private child: Child;
    public foo(): void {
        this.child.on('event', () => console.log('my child has done something'));
        this.child.directCall();
   }
}

class Child {
    public directCall(): void {
        this.emit('event');
    }
}
```

The SASS is mostly a bunch of spaghetti, but who has ever written CSS that
wasn't? Not me.

The `Editor` and the `PixelCanvas` classes are the true God objects. `PixelCanvas`
handles all the drawing (with some minor delegation to the other canvases),
while the `Editor` manages the project structure and app state.

The representation of the graphics stuff is pretty verbose, so when serializing
it just converts the `Editor` to JSON and then compresses it using gzip. It turns
out that's totally good enough. Since it's so repetitive the JSON representation
lends itself well to compression. Generally on the order of 50x for larger projects.

Many things are less than ideal (i.e. the way color palettes are set up). However,
they work, and are functional. If I deleted everything and rewrote it all from
scratch with all the lessons learned I'm sure it would be perfect and much more 
impressive. Particularly since when I started I knew nothing about the Atari 7800
and now I know slightly more than nothing.

### Prerequisites
1. [Bun](https://bun.com/docs/installation)
2. [Dart Sass](https://github.com/sass/dart-sass/releases)
    - install it to `.dev/` such that the path to the `sass` executable is
      `.dev/dart-sass/sass`

### Running locally

1. `bun install`
2. `bun run build`
3. In another terminal, `bun run start`
4. In another terminal, `bun run sass`
5. Visit http://localhost:11000/

### SVG sprite
Run `scripts/svg-inline.sh` to create an inline SVG sprite from the files
in `public/images/svg/`. For a file named `foo-bar.svg`, use like so:

```html
<i class="icon icon-svg"><svg><use href="#svg-foo-bar"/></svg></i>
```

## Deployment
You will need normal shell tools (`rsync`, `perl`, `git`) in addition to `pandoc` (for rendering
the changelog to HTML).

The release script has only been tested on Linux.

1. Create `.dev/.env` with `RELEASE_REMOTE_HOST` and `RELEASE_REMOTE_DIR` definitions, e.g.
    ```bash
    RELEASE_REMOTE_HOST=atari7800gfx.example.com
    RELEASE_REMOTE_DIR=/var/www/atari7800gfx.example.com
   ```
2. Run `scripts/release.sh`

## License
Licensed under MIT. See LICENSE for details.
