import { options } from '@prairielearn/preact-cjs';

/**
 * Sets the Preact VNode `className` property to `class`, ensuring libraries like react-bootstrap receive and apply CSS classes correctly.
 */
const oldVnode = options.vnode;
options.vnode = (vnode: any) => {
  if (typeof vnode.type == 'function' && vnode.props?.class) {
    vnode.props.className = vnode.props.class;
  }
  if (oldVnode) oldVnode(vnode);
};
