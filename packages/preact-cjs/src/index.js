const Preact = require('original-preact');

const oldVnode = Preact.options.vnode;

/**
 * Sets VNode `className` to `class`, enabling React-based libraries incompatible with the `class` prop,
 * particularly react-bootstrap, to receive and apply CSS classes from `class.`.
 */
Preact.options.vnode = (vnode) => {
  // @ts-expect-error -- `class` exists at runtime
  if (typeof vnode.type === 'function' && vnode.props?.class) {
    // @ts-expect-error -- `class` exists at runtime
    vnode.props.className = vnode.props.class;
  }
  if (oldVnode) {
    oldVnode(vnode);
  }
};

module.exports.Component = Preact.Component;
module.exports.Fragment = Preact.Fragment;
module.exports.cloneElement = Preact.cloneElement;
module.exports.createContext = Preact.createContext;
module.exports.createElement = Preact.createElement;
module.exports.createRef = Preact.createRef;
module.exports.h = Preact.h;
module.exports.hydrate = Preact.hydrate;
module.exports.isValidElement = Preact.isValidElement;
module.exports.options = Preact.options;
module.exports.render = Preact.render;
module.exports.toChildArray = Preact.toChildArray;
