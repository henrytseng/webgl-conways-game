"use strict";

const cellWidth = 8;
const cellHeight = cellWidth;

function RenderEngine(canvas, world) {
  const gl = canvas.getContext("webgl", {antialias: false});
  if(!gl) {
    document.write('WebGL is required for this example to work.');
    return;
  }

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
      return {x: x, y: y};
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
  const scene = document.createElement('canvas');
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
    const x1 = Math.floor(x / cellWidth);
    const y1 = Math.floor(y / cellHeight);
    cell = Cell(x1, y1);
    if(!world.has(x1, y1)) {
      world.add(cell);
      engine.render();
    }
    return cell;
  }

  function _stepLife() {
    console.log('step');
    // console.log(scene.toDataURL());

    // TODO use change to use convolution filter

    // Count neighbors
    const neighborCounts = new Map();

    // Build counts
    const ii = world.collection()
    let i = ii.next();
    while(!i.done) {
      let cell = i.value[1];
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
        let x = cell.x + coords[0];
        let y = cell.y + coords[1];
        let key = Symbol.for([x, y]);
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
  const x = Math.floor(100.0);
  const y = Math.floor(100.0);
  _placeAt(x+1.0*cellWidth, y);
  _placeAt(x+2.0*cellWidth, y+1.0*cellHeight);
  _placeAt(x, y+2.0*cellHeight);
  _placeAt(x+1.0*cellWidth, y+2.0*cellHeight);
  _placeAt(x+2.0*cellWidth, y+2.0*cellHeight);
  console.log(world.state());
};
