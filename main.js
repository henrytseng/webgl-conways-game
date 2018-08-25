"use strict";

function RenderEngine(canvas, world) {
  const gl = canvas.getContext("webgl");
  if(!gl) return;

  // setup GLSL program
  const program = webglUtils.createProgramFromScripts(gl, ["2d-vertex-shader", "2d-fragment-shader"]);

  // look up where the vertex data needs to go.
  const positionAttributeLocation = gl.getAttribLocation(program, "a_position");

  // look up uniform locations
  const resolutionUniformLocation = gl.getUniformLocation(program, "u_resolution");
  const colorUniformLocation = gl.getUniformLocation(program, "u_color");

  // Create a buffer to put three 2d clip space points in
  const positionBuffer = gl.createBuffer();

  // Bind it to ARRAY_BUFFER (think of it as ARRAY_BUFFER = positionBuffer)
  gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);

  webglUtils.resizeCanvasToDisplaySize(gl.canvas);

  // Tell WebGL how to convert from clip space to pixels
  gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);

  // Tell it to use our program (pair of shaders)
  gl.useProgram(program);

  // Turn on the attribute
  gl.enableVertexAttribArray(positionAttributeLocation);

  // Bind the position buffer.
  gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);

  // Tell the attribute how to get data out of positionBuffer (ARRAY_BUFFER)
  const size = 2;          // 2 components per iteration
  const type = gl.FLOAT;   // the data is 32bit floats
  const normalize = false; // don't normalize the data
  const stride = 0;        // 0 = move forward size * sizeof(type) each iteration to get the next position
  const offset = 0;        // start at the beginning of the buffer
  gl.vertexAttribPointer(
      positionAttributeLocation, size, type, normalize, stride, offset)

  // set the resolution
  gl.uniform2f(resolutionUniformLocation, gl.canvas.width, gl.canvas.height);

  function _clear() {

    // Clear the canvas
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
  }

  function _render() {
    const itr = world.collection();

    // Clear grid for rendering
    _clear();

    let entity;
    let i = itr.next();
    while(!i.done) {
      entity = i.value[1];
      if(!entity) break;

      // Load vertices
      gl.bufferData(gl.ARRAY_BUFFER, entity.vertices(), gl.STATIC_DRAW);

      // Set a random color.
      gl.uniform4f(colorUniformLocation, .5, .5, .5, 1);

      // Draw the rectangle.
      var primitiveType = gl.TRIANGLES;
      var offset = 0;
      var count = 6;
      gl.drawArrays(primitiveType, offset, count);

      i = itr.next();
    }
  }

  return {
    clear: _clear,

    render: _render
  };
}

function World(engine) {
  const _collection = new Map();

  function _getKey(entity) {
    return Symbol.for([entity.x, entity.y]);
  }

  return {

    clear: () => {
      const itr = _collection[Symbol.iterator]();
      let key;
      let i = itr.next();
      while(!i.done) {
        key = i.value[0];
        _collection.delete(key);
        i = itr.next();
      }
    },

    add: (entity) => {
      if(!entity) return;
      _collection.set(_getKey(entity), entity);
      return entity;
    },

    has: (entity) => {
      const key = _getKey(entity);
      return _collection.has(key);
    },

    remove: (entity) => {
      _collection.delete(entity);
      return entity;
    },

    collection: () => {
      return _collection[Symbol.iterator]();
    }

  }
}

function Entity(x, y, getVertices) {
  return {

    x: x,

    y: y,

    coords: () => {
      return [x, y];
    },

    /**
     * Builds tessellated vertices
     */
    vertices: getVertices
  }
}

function Cell(x, y) {
  const width = 1;
  const height = 1;
  const x1 = x;
  const y1 = y;
  const x2 = x1 + width;
  const y2 = y1 + height;

  return Entity(x, y, () => {
    return new Float32Array([
       x1, y1,
       x2, y1,
       x1, y2,
       x1, y2,
       x2, y1,
       x2, y2,
    ]);
  });
}

// Application
window.onload = () => {
  var scene = document.createElement('canvas');
  scene.id     = "scene";
  scene.width  = window.innerWidth;
  scene.height = window.innerHeight;
  document.body.appendChild(scene);
  const btnClear = document.getElementById("btn_clear");
  const btnRun = document.getElementById("btn_run");
  const btnNext = document.getElementById("btn_next");
  const world = World();
  const engine = RenderEngine(scene, world);
  let cell;
  let isDrawing = false;
  let isRunning = false;
  let intervalLife;

  function _placeAt(x, y) {
    cell = Cell(x, y);
    if(!world.has(cell)) {
      world.add(cell);
      engine.render();
    }
  }

  function _stepLife() {
    console.log('step');

  }

  function _stopLife() {
    clearInterval(intervalLife);
    btnRun.innerHTML = 'Run';
    isRunning = false;
  }

  function _startLife() {
    _stopLife();
    intervalLife = setInterval(_stepLife, 100);
    engine.render();
    btnRun.innerHTML = 'Stop';
    isRunning = true;
  }

  // Mouse cell placement
  scene.onmouseup = (e) => isDrawing = false;
  scene.onmousedown = (e) => {
    isDrawing = true;
    _placeAt(e.x, e.y);
  }
  scene.onmousemove = (e) => {
    if(isDrawing) _placeAt(e.x, e.y);
  };

  // Control buttons
  btnClear.onmouseup = (e) => {
    world.clear();
    engine.render();
  };
  btnRun.onmouseup = (e) => {
    if(!isRunning) _startLife();
    else _stopLife();
  };
  btnNext.onmouseup = _stepLife;

  // Initial state
  const x = 100;
  const y = 100;
  world.add(Cell(x+1, y));
  world.add(Cell(x+2, y+1));
  world.add(Cell(x, y+2));
  world.add(Cell(x+1, y+2));
  world.add(Cell(x+2, y+2));
  engine.render();
};
