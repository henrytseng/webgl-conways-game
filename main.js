"use strict";

var cellWidth = 8;
var cellHeight = cellWidth;
const scene = document.createElement('canvas');
const gl = scene.getContext("webgl", { antialias: false, preserveDrawingBuffer: false });
if (!gl) {
  document.write('WebGL is required for this example to work.');
}

function createTexture(w, h) {
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  return tex;
}

function createFramebuffer(texture) {
  const fb = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return fb;
}

function RenderEngine() {
  const computeProgram = webglUtils.createProgramFromScripts(gl, ["vert-shader", "compute-frag-shader"]);
  const displayProgram = webglUtils.createProgramFromScripts(gl, ["vert-shader", "display-frag-shader"]);

  // Fullscreen quad in clip space
  const quadBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
    -1, -1, 1, -1, -1, 1,
    -1, 1, 1, -1, 1, 1,
  ]), gl.STATIC_DRAW);

  const computeLoc = {
    position: gl.getAttribLocation(computeProgram, "a_position"),
    state: gl.getUniformLocation(computeProgram, "u_state"),
    gridSize: gl.getUniformLocation(computeProgram, "u_grid_size"),
  };
  const displayLoc = {
    position: gl.getAttribLocation(displayProgram, "a_position"),
    state: gl.getUniformLocation(displayProgram, "u_state"),
    gridSize: gl.getUniformLocation(displayProgram, "u_grid_size"),
    cellSize: gl.getUniformLocation(displayProgram, "u_cell_size"),
  };

  let gridW, gridH;
  let stateData;        // Uint8Array: R channel per cell, WebGL y-convention (y=0 at bottom)
  let textures = [null, null];
  let framebuffers = [null, null];
  let current = 0;

  function _init() {
    gridW = Math.floor(scene.width / cellWidth);
    gridH = Math.floor(scene.height / cellHeight);
    stateData = new Uint8Array(gridW * gridH);

    for (let i = 0; i < 2; i++) {
      if (textures[i]) gl.deleteTexture(textures[i]);
      if (framebuffers[i]) gl.deleteFramebuffer(framebuffers[i]);
      textures[i] = createTexture(gridW, gridH);
      framebuffers[i] = createFramebuffer(textures[i]);
    }
    current = 0;
    _uploadState();
  }

  function _uploadState() {
    const rgba = new Uint8Array(gridW * gridH * 4);
    for (let i = 0; i < gridW * gridH; i++) {
      rgba[i * 4] = stateData[i];
      rgba[i * 4 + 3] = 255;
    }
    gl.bindTexture(gl.TEXTURE_2D, textures[current]);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gridW, gridH, 0, gl.RGBA, gl.UNSIGNED_BYTE, rgba);
  }

  function _bindQuad(positionLoc) {
    gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
    gl.enableVertexAttribArray(positionLoc);
    gl.vertexAttribPointer(positionLoc, 2, gl.FLOAT, false, 0, 0);
  }

  // Run one Game of Life step entirely on GPU using convolution shader
  function _step() {
    const next = 1 - current;

    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffers[next]);
    gl.viewport(0, 0, gridW, gridH);
    gl.useProgram(computeProgram);
    _bindQuad(computeLoc.position);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, textures[current]);
    gl.uniform1i(computeLoc.state, 0);
    gl.uniform2f(computeLoc.gridSize, gridW, gridH);
    gl.drawArrays(gl.TRIANGLES, 0, 6);

    current = next;

    // Sync GPU state back to CPU for interaction queries (getCell / getState)
    const rgba = new Uint8Array(gridW * gridH * 4);
    gl.readPixels(0, 0, gridW, gridH, gl.RGBA, gl.UNSIGNED_BYTE, rgba);
    for (let i = 0; i < gridW * gridH; i++) {
      stateData[i] = rgba[i * 4];
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  function _render() {
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, scene.width, scene.height);
    gl.useProgram(displayProgram);
    _bindQuad(displayLoc.position);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, textures[current]);
    gl.uniform1i(displayLoc.state, 0);
    gl.uniform2f(displayLoc.gridSize, gridW, gridH);
    gl.uniform2f(displayLoc.cellSize, cellWidth, cellHeight);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }

  // x, y in CSS coordinates (y=0 at top); convert to WebGL y (y=0 at bottom) for texture storage
  function _setCell(x, y, alive) {
    if (x < 0 || x >= gridW || y < 0 || y >= gridH) return;
    const ygl = gridH - 1 - y;
    stateData[ygl * gridW + x] = alive ? 255 : 0;
    const pixel = new Uint8Array([alive ? 255 : 0, 0, 0, 255]);
    gl.bindTexture(gl.TEXTURE_2D, textures[current]);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, x, ygl, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
  }

  function _getCell(x, y) {
    if (x < 0 || x >= gridW || y < 0 || y >= gridH) return false;
    return stateData[(gridH - 1 - y) * gridW + x] > 0;
  }

  // Return alive cells as [[x, y_css], ...] (CSS y convention for localStorage compatibility)
  function _getState() {
    const list = [];
    for (let ygl = 0; ygl < gridH; ygl++) {
      for (let x = 0; x < gridW; x++) {
        if (stateData[ygl * gridW + x]) list.push([x, gridH - 1 - ygl]);
      }
    }
    return list;
  }

  function _clear() {
    stateData.fill(0);
    _uploadState();
  }

  return {
    init: _init,
    step: _step,
    render: _render,
    setCell: _setCell,
    getCell: _getCell,
    getState: _getState,
    clear: _clear,
  };
}

// Application
window.onload = () => {
  const localStorage = window.localStorage;
  scene.id = "scene";
  scene.width = window.innerWidth;
  scene.height = window.innerHeight;
  document.body.appendChild(scene);

  const btnClear = document.getElementById("btn_clear");
  const btnRun = document.getElementById("btn_run");
  const btnNext = document.getElementById("btn_next");
  const inputSpeed = document.getElementById("input_speed");
  const inputSize = document.getElementById("input_size");

  if (localStorage.getItem('speed')) inputSpeed.value = localStorage.getItem('speed');
  if (localStorage.getItem('cellWidth')) inputSize.value = localStorage.getItem('cellWidth');

  cellWidth = cellHeight = Math.max(1, parseFloat(inputSize.value));

  const engine = RenderEngine();
  engine.init();

  let isDrawing = null;
  let isRunning = false;
  let intervalLife;
  let speed = Math.max(1, parseInt(inputSpeed.value));

  function _placeAt(x, y, isCreate) {
    if ((isDrawing === true || isCreate) && !engine.getCell(x, y)) {
      engine.setCell(x, y, true);
    } else if (isDrawing === false) {
      engine.setCell(x, y, false);
    }
    engine.render();
  }

  function _stepLife() {
    engine.step();
    engine.render();
  }

  function _stopLife() {
    clearInterval(intervalLife);
    btnRun.innerHTML = 'Run';
    isRunning = false;
    console.log(JSON.stringify(engine.getState()));
  }

  function _startLife() {
    _stopLife();
    intervalLife = setInterval(_stepLife, speed);
    engine.render();
    btnRun.innerHTML = 'Stop';
    isRunning = true;
  }

  scene.onmouseup = (e) => {
    isDrawing = null;
    localStorage.setItem("world.state", JSON.stringify(engine.getState()));
  };
  scene.onmousedown = (e) => {
    const x1 = Math.floor(e.x / cellWidth);
    const y1 = Math.floor(e.y / cellHeight);
    isDrawing = !engine.getCell(x1, y1);
    _placeAt(x1, y1, true);
  };
  scene.onmousemove = (e) => {
    const x1 = Math.floor(e.x / cellWidth);
    const y1 = Math.floor(e.y / cellHeight);
    if (isDrawing !== null) _placeAt(x1, y1);
  };

  scene.addEventListener("touchstart", (e) => {
    e.preventDefault();
    const touch = e.touches[0];
    const rect = scene.getBoundingClientRect();
    const x1 = Math.floor((touch.clientX - rect.left) / cellWidth);
    const y1 = Math.floor((touch.clientY - rect.top) / cellHeight);
    isDrawing = !engine.getCell(x1, y1);
    _placeAt(x1, y1, true);
  }, { passive: false });
  scene.addEventListener("touchmove", (e) => {
    e.preventDefault();
    const touch = e.touches[0];
    const rect = scene.getBoundingClientRect();
    const x1 = Math.floor((touch.clientX - rect.left) / cellWidth);
    const y1 = Math.floor((touch.clientY - rect.top) / cellHeight);
    if (isDrawing !== null) _placeAt(x1, y1);
  }, { passive: false });
  scene.addEventListener("touchend", (e) => {
    e.preventDefault();
    isDrawing = null;
    localStorage.setItem("world.state", JSON.stringify(engine.getState()));
  }, { passive: false });

  btnClear.onmouseup = (e) => {
    engine.clear();
    engine.render();
    localStorage.removeItem("world.state");
  };
  btnRun.onmouseup = (e) => {
    if (!isRunning) _startLife();
    else _stopLife();
  };
  btnNext.onmouseup = _stepLife;
  inputSpeed.onchange = (e) => {
    speed = Math.max(1, parseInt(inputSpeed.value));
    localStorage.setItem("speed", speed);
    if (isRunning) { _stepLife(); _startLife(); }
  };
  inputSize.onchange = (e) => {
    cellWidth = cellHeight = Math.max(1, parseFloat(inputSize.value));
    localStorage.setItem("cellWidth", cellWidth);
    const list = engine.getState();
    engine.init();
    list.forEach(([x, y]) => engine.setCell(x, y, true));
    engine.render();
  };

  const initX = Math.floor(500.0 / cellWidth);
  const initY = Math.floor(200.0 / cellHeight);
  const storedState = JSON.parse(localStorage.getItem("world.state"));
  const initialState = storedState || [
    [initX + 1, initY],
    [initX, initY + 2],
    [initX + 1, initY + 2],
    [initX + 3, initY + 1],
    [initX + 4, initY + 2],
    [initX + 5, initY + 2],
    [initX + 6, initY + 2],
  ];
  initialState.forEach(([x, y]) => engine.setCell(x, y, true));
  engine.render();
};
