/**
 * Accept Vue 2-style createElement data objects (`attrs` / `on` / `domProps` / `props`)
 * and flatten them for Vue 3's `h()`.
 */
export function createCompatH(vueH: (...args: any[]) => any) {
  return function h(type: any, dataOrChildren?: any, children?: any) {
    if (
      dataOrChildren == null ||
      Array.isArray(dataOrChildren) ||
      typeof dataOrChildren !== 'object' ||
      (dataOrChildren as any).__v_isVNode
    ) {
      return vueH(type, dataOrChildren, children);
    }
    const data = dataOrChildren as Record<string, any>;
    const {
      attrs,
      on,
      domProps,
      props,
      key,
      ref,
      class: klass,
      style,
      ...rest
    } = data;
    const flat: Record<string, any> = { ...rest, ...attrs, ...domProps, ...props };
    if (klass !== undefined) flat.class = klass;
    if (style !== undefined) flat.style = style;
    if (key !== undefined) flat.key = key;
    if (ref !== undefined) flat.ref = ref;
    if (on && typeof on === 'object') {
      for (const [raw, handler] of Object.entries(on)) {
        const camel = raw.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
        flat[`on${camel.charAt(0).toUpperCase()}${camel.slice(1)}`] = handler;
      }
    }
    return vueH(type, flat, children);
  };
}
