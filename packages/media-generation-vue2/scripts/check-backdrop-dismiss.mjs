/**
 * Node render of the built MediaGenerationDialog.
 * Backdrop click must not emit close or set open false; the close button must.
 * Run after `npm run build` (portal imports dist).
 */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { JSDOM } from 'jsdom';

const require = createRequire(import.meta.url);

const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
  url: 'http://localhost/',
});
const { window } = dom;

function expose(name, value) {
  Object.defineProperty(globalThis, name, {
    value,
    configurable: true,
    writable: true,
  });
}

expose('window', window);
expose('document', window.document);
expose('HTMLElement', window.HTMLElement);
expose('Element', window.Element);
expose('Node', window.Node);
expose('SVGElement', window.SVGElement);

const Vue = require('vue');
const { MediaGenerationDialog } = require('../dist/index.js');

const events = { input: [], close: 0 };

const Root = Vue.extend({
  data() {
    return { open: true };
  },
  render(h) {
    return h(MediaGenerationDialog, {
      props: {
        value: this.open,
        adapter: {
          listModels: async () => ({ models: [], generationEnabled: true }),
        },
      },
      on: {
        input: (value) => {
          events.input.push(value);
          this.open = value;
        },
        close: () => {
          events.close += 1;
        },
      },
    });
  },
});

const vm = new Root().$mount();
window.document.body.appendChild(vm.$el);

function flush() {
  return new Promise((resolve) => setImmediate(resolve));
}

await Vue.nextTick();
await flush();
await Vue.nextTick();

const overlay = window.document.querySelector('.nx-mg-overlay');
assert.ok(overlay, 'dialog overlay should be open');
overlay.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
await Vue.nextTick();

assert.deepEqual(events.input, [], 'backdrop click must not emit input');
assert.equal(events.close, 0, 'backdrop click must not emit close');
assert.equal(vm.open, true, 'backdrop click must leave the dialog open');
assert.ok(window.document.querySelector('.nx-mg-overlay'), 'overlay should remain after backdrop click');
assert.ok(window.document.querySelector('.nx-mg-dialog'), 'dialog should remain after backdrop click');

const closeBtn = window.document.querySelector('.nx-mg-icon-btn');
assert.ok(closeBtn, 'close button should be present');
closeBtn.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
await Vue.nextTick();

assert.deepEqual(events.input, [false], 'close button must emit input false');
assert.equal(events.close, 1, 'close button must emit close');
assert.equal(vm.open, false, 'close button must set open false');
assert.equal(window.document.querySelector('.nx-mg-overlay'), null, 'overlay should unmount after close');

vm.$destroy();
window.close();
console.log('backdrop dismiss check passed');
