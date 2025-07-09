import { type VNode, options } from '@prairielearn/preact-cjs';

/**
 * Sets VNode `class` prop to `className`, ensuring particular React-based
 * libraries, namely react-bootstrap, receive and apply CSS classes correctly.
 */
export const setPreactClassToClassName = () => {
  const oldVnode = options.vnode;
  options.vnode = (vnode: VNode<any>) => {
    if (typeof vnode.type == 'function' && vnode.props?.class) {
      vnode.props.className = vnode.props.class;
    }
    if (oldVnode) oldVnode(vnode);
  };
};
