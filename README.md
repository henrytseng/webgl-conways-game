# Conway's Game of Life

An implementation of Conway's Game of Life using WebGL convolution filter.  This implementation uses a canvas as the world and allows a user to place cells using the mouse cursor click/drag.  

The Rules

* For a space that is 'populated':
  * Each cell with one or no neighbors dies, as if by solitude.
  * Each cell with four or more neighbors dies, as if by overpopulation.
  * Each cell with two or three neighbors survives.
* For a space that is 'empty' or 'unpopulated'
  * Each cell with three neighbors becomes populated.


## Usage

To run use a web server.  For example,

```
$ npm install hostr
```

Then host the application using:

```
$ ./node_modules/.bin/hostr
```

Visit `http://localhost:3000`
