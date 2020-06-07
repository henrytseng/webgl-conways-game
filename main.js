"use strict";

var cellWidth = 8;
var cellHeight = cellWidth;
const scene = document.createElement('canvas');
const gl = scene.getContext("webgl", {antialias: false, preserveDrawingBuffer: false});
if(!gl) {
  document.write('WebGL is required for this example to work.');
}

function RenderEngine(world) {
  // setup GLSL program
  const program = webglUtils.createProgramFromScripts(gl, ["2d-vertex-shader", "2d-fragment-shader"]);

  // look up where the vertex data needs to go.
  const positionAttributeLocation = gl.getAttribLocation(program, "a_position");
  const texcoordLocation = gl.getAttribLocation(program, "a_texCoord");

  // look up uniform locations
  const resolutionUniformLocation = gl.getUniformLocation(program, "u_resolution");
  const colorUniformLocation = gl.getUniformLocation(program, "u_color");

  // Create a buffer to put three 2d clip space points in
  const positionBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);

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
  gl.vertexAttribPointer(positionAttributeLocation, size, type, normalize, stride, offset)

  // set the resolution
  gl.uniform2f(resolutionUniformLocation, gl.canvas.width, gl.canvas.height);

  /**
   * Clear the canvas
   */
  function _clear() {
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
  }

  /**
   * Render the world
   */
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
      gl.uniform4f(colorUniformLocation, 0, 0, 0, 1);

      // Draw the rectangle.
      var primitiveType = gl.TRIANGLES;
      var offset = 0;
      var count = 6;
      gl.drawArrays(primitiveType, offset, count);
      i = itr.next();
    }
  }

  function _read(x, y) {
    const format = gl.getParameter(gl.IMPLEMENTATION_COLOR_READ_FORMAT);
    const type = gl.getParameter(gl.IMPLEMENTATION_COLOR_READ_TYPE);
    const pixelBuffer = new Uint8Array(4);
    gl.readPixels(x * cellWidth, y * cellWidth, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixelBuffer);
    console.log(x, y, pixelBuffer);  
  }

  return {
    clear: _clear,

    read: _read,

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

    get: (x, y) => {
      return _collection.get(Symbol.for([x, y]));
    },

    has: (x, y) => {
      return !!_collection.get(Symbol.for([x, y]));
    },

    remove: (x, y) => {
      _collection.delete(Symbol.for([x, y]));
    },

    collection: () => {
      return _collection[Symbol.iterator]();
    },

    state: () => {
      const list = [];
      const itr = _collection[Symbol.iterator]();
      let i = itr.next();
      while(!i.done) {
        list.push(i.value[1].coords());
        i = itr.next();
      }
      return list;
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
  const x1 = x * cellWidth;
  const y1 = y * cellHeight;
  const x2 = x1 + cellWidth;
  const y2 = y1 + cellHeight;

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
  const localStorage = window.localStorage;
  scene.id     = "scene";
  scene.width  = window.innerWidth;
  scene.height = window.innerHeight;
  document.body.appendChild(scene);
  const btnClear = document.getElementById("btn_clear");
  const btnRun = document.getElementById("btn_run");
  const btnNext = document.getElementById("btn_next");
  const inputSpeed = document.getElementById("input_speed");
  const inputSize = document.getElementById("input_size");
  const world = World();
  const engine = RenderEngine(world);

  // Inital parameters
  if(localStorage.getItem('speed')) inputSpeed.value = localStorage.getItem('speed');
  if(localStorage.getItem('cellWidth')) inputSize.value = localStorage.getItem('cellWidth');

  let cell;
  let isDrawing = null;
  let isRunning = false;
  let intervalLife;
  let speed = Math.max(1, parseInt(inputSpeed.value));
  cellWidth = cellHeight = Math.max(1, parseFloat(inputSize.value));

  function _placeAt(x, y, isCreate) {
    cell = Cell(x, y);
    if((isDrawing === true || isCreate) && !world.has(x, y)) {
      world.add(cell);
    } else if(isDrawing === false) {
      world.remove(x, y);
    }
    engine.render();
    engine.read(x, y);
    return cell;
  }

  function _stepLife() {

    // TODO use change to use convolution filter

    // Count neighbors
    const neighborCounts = new Map();

    // Build counts
    const ii = world.collection()
    let i = ii.next();
    while(!i.done) {
      let cell = i.value[1];

      // Initialize each cell
      neighborCounts.set(i.value[0], neighborCounts.get(i.value[0]) || 0);

      // Add count to neighbors
      [
        [-1,-1],
        [0,-1],
        [1,-1],
        [1,0],
        [1,1],
        [0,1],
        [-1,1],
        [-1,0],
      ].forEach((coords) => {
        const x = cell.x + coords[0];
        const y = cell.y + coords[1];
        const key = Symbol.for([x, y]);
        let count = neighborCounts.get(key) || 0;
        count++;
        neighborCounts.set(key, count);
      });
      i = ii.next();
    }

    // Set next stage
    let nn = neighborCounts[Symbol.iterator]();
    let n = nn.next();
    while(!n.done) {
      let key = n.value[0];
      let count = n.value[1];
      let coords = Symbol.keyFor(key).split(',').map((i) => parseInt(i));
      let cell = Cell.apply(null, coords);

      if(world.has(coords[0], coords[1])) {
        if(count <= 1 || count >= 4) {
          world.remove(coords[0], coords[1]);
        }
      } else {
        if(count == 3) {
          world.add(Cell(coords[0], coords[1]));
        }
      }
      n = nn.next()
    }
    engine.render();
  }

  function _stopLife() {
    clearInterval(intervalLife);
    btnRun.innerHTML = 'Run';
    isRunning = false;
    console.log(JSON.stringify(world.state()));
  }

  function _startLife() {
    _stopLife();
    intervalLife = setInterval(_stepLife, speed);
    engine.render();
    btnRun.innerHTML = 'Stop';
    isRunning = true;
  }

  // Mouse cell placement
  scene.onmouseup = (e) => {
    isDrawing = null;
    localStorage.setItem("world.state", JSON.stringify(world.state()));
  };
  scene.onmousedown = (e) => {
    const x1 = Math.floor(e.x / cellWidth);
    const y1 = Math.floor(e.y / cellHeight);
    isDrawing = !world.has(x1, y1);
    _placeAt(x1, y1, true);
  }
  scene.onmousemove = (e) => {
    const x1 = Math.floor(e.x / cellWidth);
    const y1 = Math.floor(e.y / cellHeight);
    if(isDrawing !== null) {
      _placeAt(x1, y1);
    }
  };

  // Controls
  btnClear.onmouseup = (e) => {
    world.clear();
    engine.render();
    localStorage.removeItem("world.state")
  };
  btnRun.onmouseup = (e) => {
    if(!isRunning) _startLife();
    else _stopLife();
  };
  btnNext.onmouseup = _stepLife;
  inputSpeed.onchange = (e) => {
    speed = Math.max(1, parseInt(inputSpeed.value));
    localStorage.setItem("speed", speed);
    if(isRunning) {
      _stepLife();
      _startLife();
    }
  };
  inputSize.onchange = (e) => {
    cellWidth = cellHeight = Math.max(1, parseFloat(inputSize.value));
    localStorage.setItem("cellWidth", cellWidth);
    const list = world.state();
    world.clear();
    list.forEach((coords) => {
      world.add(Cell(coords[0], coords[1]));
    });
    engine.render();
  };

  // Initial state
  const initX = Math.floor(500.0/cellWidth);
  const initY = Math.floor(200.0/cellHeight);
  const storedState = JSON.parse(localStorage.getItem("world.state"));
  const initialState = storedState || [
    [initX+1, initY],
    [initX, initY+2],
    [initX+1, initY+2],
    [initX+3, initY+1],
    [initX+4, initY+2],
    [initX+5, initY+2],
    [initX+6, initY+2],
  ];
  initialState.forEach((coords) => {
    _placeAt(coords[0], coords[1], true);
  });
};
