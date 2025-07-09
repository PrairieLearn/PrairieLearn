import { options } from '@prairielearn/preact-cjs';

/**
 * Change `class` to `className` in Preact VNode props. Enables `class` to be used in react-bootstrap components, since
 * react-bootstrap uses `className` for styling.
 */

const oldVnode = options.vnode;
options.vnode = (vnode: any) => {
if (typeof vnode.type == 'function' && vnode.props?.class) {
    vnode.props.className = vnode.props.class;
}
if (oldVnode) oldVnode(vnode);
}