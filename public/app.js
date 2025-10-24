// public/app/utils.ts
var nope = (x) => {};

// public/app/Logger.ts
class Logger {
  name;
  constructor(name) {
    this.name = name;
  }
  static from(instance) {
    return new Logger(instance.constructor.name);
  }
  log(level, ...objects) {
    if (!objects.length) {
      return;
    }
    switch (level) {
      case "debug":
      case "info":
      case "warn":
      case "error":
        console[level](`[${this.name}]`, ...objects);
        break;
      default:
        nope(level);
        break;
    }
  }
  debug(...messages) {
    this.log("debug", ...messages);
  }
  info(...messages) {
    this.log("info", ...messages);
  }
  warn(...messages) {
    this.log("warn", ...messages);
  }
  error(...messages) {
    this.log("error", ...messages);
  }
}

// public/app/PixelCanvas.ts
class PixelCanvas {
  width;
  height;
  displayWidth;
  displayHeight;
  pixelWidth;
  pixelHeight;
  zoomLevel;
  isEditable = false;
  ctx;
  logger;
  eventMap = {};
  pixelData;
  showGrid;
  $el;
  $gridEl;
  $hoverEl;
  drawState = "idle";
  constructor(options) {
    this.logger = Logger.from(this);
    this.$el = options.canvasEl;
    const context = this.$el.getContext("2d");
    if (!context) {
      throw new Error("Unable to retrieve 2d context for canvas element");
    }
    this.ctx = context;
    this.pixelData = options.pixelData || [];
    this.pixelWidth = options.pixelWidth;
    this.pixelHeight = options.pixelHeight;
    this.zoomLevel = options.zoomLevel || 1;
    this.showGrid = typeof options.showGrid === "boolean" ? options.showGrid : false;
    this.width = options.width;
    this.height = options.height;
    this.displayWidth = this.width * this.displayPixelWidth;
    this.displayHeight = this.height * this.displayPixelHeight;
    this.logger.info(`setting display to ${this.displayWidth}x${this.displayHeight}`);
    this.$gridEl = document.createElement("canvas");
    this.$gridEl.classList.add("editor-grid");
    this.$el.insertAdjacentElement("afterend", this.$gridEl);
    this.$hoverEl = document.createElement("canvas");
    this.$hoverEl.classList.add("editor-hover");
    this.$el.insertAdjacentElement("afterend", this.$hoverEl);
    this.setCanvasDimensions();
    this.render();
    if (options.editable) {
      this.enable();
    } else {
      this.disable();
    }
  }
  setCanvasDimensions() {
    this.displayWidth = this.width * this.displayPixelWidth;
    this.displayHeight = this.height * this.displayPixelHeight;
    this.$el.width = this.$gridEl.width = this.$hoverEl.width = this.displayWidth;
    this.$el.height = this.$gridEl.height = this.$hoverEl.height = this.displayHeight;
    this.setCanvasPosition();
    this.fillPixelDataArray();
  }
  setCanvasPosition() {
    const computedStyle = window.getComputedStyle(this.$el);
    const borderTopWidth = parseInt(computedStyle?.getPropertyValue("border-top-width"), 10);
    const borderLeftWidth = parseInt(computedStyle?.getPropertyValue("border-left-width"), 10);
    this.$gridEl.style.top = this.$hoverEl.style.top = this.$el.offsetTop + borderTopWidth + "px";
    this.$gridEl.style.left = this.$hoverEl.style.left = this.$el.offsetLeft + borderLeftWidth + "px";
  }
  fillPixelDataArray() {
    for (let row = 0;row < this.height; row++) {
      const pixelRow = this.pixelData[row] = this.pixelData[row] || [];
      for (let col = 0;col < this.width; col++) {
        pixelRow[col] = pixelRow[col] || { color: null };
      }
    }
  }
  disable() {
    if (!this.isEditable) {
      return;
    }
    this.isEditable = false;
  }
  enable() {
    if (this.isEditable) {
      return;
    }
    const activatePixelAtCursor = (e) => {
      const { clientX, clientY } = e;
      const offsetY = this.$el.offsetTop;
      const offsetX = this.$el.offsetLeft;
      const trueX = clientX + document.documentElement.scrollLeft - offsetX;
      const trueY = clientY + document.documentElement.scrollTop - offsetY;
      const pixelData = this.getPixelAt({ x: trueX, y: trueY });
      if (!pixelData.pixel) {
        this.logger.warn(`no pixel found at ${trueX},${trueY}`);
      } else {
        this.drawPixelFromRowAndCol({ x: pixelData.col, y: pixelData.row }, "green");
      }
    };
    const onMouseMove = (e) => {
      activatePixelAtCursor(e);
    };
    const onMouseDown = (e) => {
      if (!this.isEditable) {
        return;
      }
      if (this.drawState !== "idle") {
        return;
      }
      this.setDrawState("drawing");
      this.unhighlightPixel();
      activatePixelAtCursor(e);
      this.$el.addEventListener("mousemove", onMouseMove);
    };
    const onMouseUp = () => {
      this.$el.removeEventListener("mousemove", onMouseMove);
      if (this.drawState !== "idle") {
        this.setDrawState("idle");
      }
    };
    const onHover = (e) => {
      if (this.drawState !== "idle") {
        return;
      }
      this.unhighlightPixel();
      const { clientX, clientY } = e;
      const offsetY = this.$el.offsetTop;
      const offsetX = this.$el.offsetLeft;
      const trueX = clientX + document.documentElement.scrollLeft - offsetX;
      const trueY = clientY + document.documentElement.scrollTop - offsetY;
      const pixelData = this.getPixelAt({ x: trueX, y: trueY });
      if (!pixelData.pixel) {
        this.logger.warn(`no pixel found at ${trueX},${trueY}`);
      } else {
        this.highlightPixel({ x: pixelData.col, y: pixelData.row });
      }
    };
    const onMouseOut = () => {
      this.unhighlightPixel();
    };
    this.eventMap["mousedown"] = [onMouseDown];
    this.eventMap["mousemove"] = [onMouseMove];
    this.eventMap["mouseup"] = [onMouseUp];
    this.$el.addEventListener("mousedown", onMouseDown);
    this.$el.addEventListener("mousemove", onHover);
    this.$el.addEventListener("mouseout", onMouseOut);
    this.$el.ownerDocument.addEventListener("mouseup", onMouseUp);
    window.addEventListener("resize", (() => {
      let timerId = null;
      return () => {
        if (timerId) {
          window.clearTimeout(timerId);
          timerId = null;
        }
        timerId = window.setTimeout(() => {
          this.setCanvasPosition();
        }, 150);
      };
    })());
    this.isEditable = true;
  }
  setDrawState(newState) {
    this.logger.info(`setting drawState to ${newState}`);
    this.drawState = newState;
  }
  clear() {
    this.ctx.clearRect(0, 0, this.displayWidth, this.displayHeight);
  }
  render() {
    this.clear();
    for (let row = 0;row < this.pixelData.length; row++) {
      const pixelRow = this.pixelData[row];
      for (let col = 0;col < pixelRow.length; col++) {
        const pixelInfo = pixelRow[col];
        this.drawPixelFromRowAndCol({ x: col, y: row }, pixelInfo.color);
      }
    }
    this.renderGrid();
  }
  renderGrid() {
    const ctx = this.$gridEl.getContext("2d");
    if (!ctx) {
      this.logger.error("no grid canvas context");
      return;
    }
    const width = this.displayWidth;
    const height = this.displayHeight;
    ctx.clearRect(0, 0, width, height);
    if (!this.showGrid) {
      return;
    }
    ctx.strokeStyle = "rgba(0, 0, 0, 0.5)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0;i <= width; i += this.displayPixelWidth) {
      ctx.moveTo(i, 0);
      ctx.lineTo(i, height);
    }
    for (let i = 0;i <= height; i += this.displayPixelHeight) {
      ctx.moveTo(0, i);
      ctx.lineTo(width, i);
    }
    ctx.stroke();
  }
  drawPixelFromScreenLocation(location, color) {
    if (!this.isEditable) {
      return false;
    }
    if (color === null) {
      this.ctx.clearRect(location.x, location.y, this.displayPixelWidth, this.displayPixelHeight);
      return false;
    }
    this.ctx.fillStyle = color;
    this.ctx.fillRect(location.x, location.y, this.displayPixelWidth, this.displayPixelHeight);
    return true;
  }
  drawPixelFromRowAndCol(pixelRowAndCol, color) {
    if (!this.isEditable) {
      return false;
    }
    const { x: col, y: row } = pixelRowAndCol;
    const pixel = this.pixelData[row]?.[col] || null;
    if (!pixel) {
      this.logger.error(`No pixel data at coordinate ${pixelRowAndCol.x},${pixelRowAndCol.y}`);
      return false;
    }
    const absoluteCoordinate = this.convertPixelToAbsoluteCoordinate(pixelRowAndCol);
    if (this.drawPixelFromScreenLocation(absoluteCoordinate, color)) {
      pixel.color = color;
      return true;
    }
    this.logger.warn(`failed to draw pixel`);
    return false;
  }
  highlightPixel(pixelRowAndCol) {
    const { x: col, y: row } = pixelRowAndCol;
    const pixel = this.pixelData[row]?.[col] || null;
    if (!pixel) {
      return false;
    }
    const ctx = this.$hoverEl.getContext("2d");
    if (!ctx) {
      return false;
    }
    const absoluteCoordinate = this.convertPixelToAbsoluteCoordinate(pixelRowAndCol);
    ctx.strokeStyle = "rgba(0, 0, 0, 0.75)";
    ctx.setLineDash([2, 2]);
    ctx.strokeRect(absoluteCoordinate.x, absoluteCoordinate.y, this.displayPixelWidth, this.displayPixelHeight);
    ctx.fillStyle = "rgba(0, 0, 0, 0.25)";
    ctx.fillRect(absoluteCoordinate.x, absoluteCoordinate.y, this.displayPixelWidth, this.displayPixelHeight);
    return true;
  }
  get displayPixelWidth() {
    return this.pixelWidth * this.zoomLevel;
  }
  get displayPixelHeight() {
    return this.pixelHeight * this.zoomLevel;
  }
  unhighlightPixel() {
    const ctx = this.$hoverEl.getContext("2d");
    if (!ctx) {
      return false;
    }
    ctx.clearRect(0, 0, this.displayWidth, this.displayHeight);
    return true;
  }
  convertAbsoluteToPixelCoordinate(location) {
    const pixelX = Math.floor(location.x / this.zoomLevel / this.pixelWidth);
    const pixelY = Math.floor(location.y / this.zoomLevel / this.pixelHeight);
    return { x: pixelX, y: pixelY };
  }
  convertPixelToAbsoluteCoordinate(location) {
    const absoluteX = location.x * this.displayPixelWidth;
    const absoluteY = location.y * this.displayPixelHeight;
    return { x: absoluteX, y: absoluteY };
  }
  getPixelAt(screenLocation) {
    const { x: col, y: row } = this.convertAbsoluteToPixelCoordinate(screenLocation);
    const pixel = this.pixelData[row]?.[col] || null;
    return {
      row,
      col,
      pixel
    };
  }
  setShowGrid(showGrid) {
    this.showGrid = showGrid;
    this.renderGrid();
  }
  setZoomLevel(zoomLevel) {
    if (zoomLevel < 1 || zoomLevel > 4 || !Number.isInteger(zoomLevel)) {
      return;
    }
    this.zoomLevel = zoomLevel;
    this.setCanvasDimensions();
    this.render();
  }
  setDimensions(width, height) {
    if (width !== null) {
      this.width = width;
    }
    if (height !== null) {
      this.height = height;
    }
    this.setCanvasDimensions();
    this.render();
  }
  setPixelDimensions(width, height) {
    if (width !== null) {
      this.pixelWidth = width;
    }
    if (height !== null) {
      this.pixelHeight = height;
    }
    this.setCanvasDimensions();
    this.render();
  }
}

// public/app.ts
var editorCanvasEl = document.getElementById("editor");
if (!(editorCanvasEl instanceof HTMLCanvasElement)) {
  throw new Error('Unable to find <canvas> element with id "editor"');
}
var loResPixelWidth = 12;
var loResPixelHeight = 7;
var hiResPixelWidth = loResPixelWidth / 2;
var options = {
  canvasEl: editorCanvasEl,
  editable: true,
  width: 30,
  height: 30,
  pixelHeight: loResPixelHeight,
  pixelWidth: loResPixelWidth,
  zoomLevel: 3,
  showGrid: false,
  pixelData: [
    [{ color: "red" }, { color: "blue" }, { color: "green" }],
    [{ color: "black" }, { color: "yellow" }, { color: "magenta" }],
    [{ color: "orange" }, { color: "purple" }, { color: "cyan" }]
  ]
};
var editorCanvas = new PixelCanvas(options);
editorCanvas.render();
document.querySelectorAll(".options-form input").forEach((el) => {
  const input = el;
  input.addEventListener("change", () => {
    switch (input.id) {
      case "option-show-grid":
        editorCanvas.setShowGrid(input.checked);
        break;
      case "option-zoom-level":
        editorCanvas.setZoomLevel(Number(input.value));
        break;
      case "option-width":
        editorCanvas.setDimensions(Number(input.value), null);
        break;
      case "option-height":
        editorCanvas.setDimensions(null, Number(input.value));
        break;
      case "option-pixel-width":
        editorCanvas.setPixelDimensions(Number(input.value), null);
        break;
      case "option-pixel-height":
        editorCanvas.setPixelDimensions(null, Number(input.value));
        break;
    }
  });
  switch (input.id) {
    case "option-show-grid":
      input.checked = !!options.showGrid;
      break;
    case "option-zoom-level":
      input.value = String(options.zoomLevel || 2);
      break;
    case "option-pixel-width":
      input.value = String(options.pixelWidth || 1);
      break;
    case "option-pixel-height":
      input.value = String(options.pixelHeight || 1);
      break;
    case "option-width":
      input.value = String(options.width || 10);
      break;
    case "option-height":
      input.value = String(options.height || 10);
      break;
  }
});
