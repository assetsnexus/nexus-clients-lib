<template>
  <div ref="host" class="nx-vrm-preview" :style="{ height: height + 'px' }">
    <p v-if="!src" class="nx-vrm-empty">No VRM loaded</p>
    <p v-else-if="loadError" class="nx-vrm-error">{{ loadError }}</p>
  </div>
</template>

<script>
/**
 * Minimal orbit preview for a VRM URL.
 * Peer deps: three, @pixiv/three-vrm (host isolates versions from portal VisualModel).
 */
export default {
  name: 'VrmPreview',
  props: {
    src: { type: String, default: '' },
    height: { type: Number, default: 240 },
  },
  data() {
    return {
      loadError: null,
      animId: null,
      clock: null,
      currentVrm: null,
    };
  },
  watch: {
    src() {
      void this.reload();
    },
  },
  mounted() {
    void this.initScene().then(() => this.reload());
  },
  beforeDestroy() {
    this.dispose();
  },
  methods: {
    async initScene() {
      const host = this.$refs.host;
      if (!host) return;
      try {
        const THREE = await import('three');
        const { OrbitControls } = await import('three/examples/jsm/controls/OrbitControls.js');
        const w = host.clientWidth || 320;
        const h = this.height;
        this.THREE = THREE;
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0xf0f2f5);
        this.camera = new THREE.PerspectiveCamera(35, w / h, 0.01, 100);
        this.camera.position.set(0, 1.2, 2.2);
        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        this.renderer.setSize(w, h);
        host.appendChild(this.renderer.domElement);
        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.target.set(0, 1.0, 0);
        this.controls.enableDamping = true;
        this.scene.add(new THREE.AmbientLight(0xffffff, 0.7));
        const dir = new THREE.DirectionalLight(0xffffff, 1.1);
        dir.position.set(1.5, 2.5, 2);
        this.scene.add(dir);
        this.clock = new THREE.Clock();
        const animate = () => {
          this.animId = requestAnimationFrame(animate);
          const delta = this.clock ? this.clock.getDelta() : 0;
          if (this.currentVrm && this.currentVrm.update) {
            this.currentVrm.update(delta);
          }
          if (this.controls) this.controls.update();
          if (this.renderer && this.scene && this.camera) {
            this.renderer.render(this.scene, this.camera);
          }
        };
        animate();
      } catch (e) {
        this.loadError =
          e instanceof Error
            ? e.message
            : 'Failed to initialize 3D preview (is three installed?)';
      }
    },
    clearModel() {
      if (this.currentVrm && this.scene) {
        this.scene.remove(this.currentVrm.scene);
        if (typeof this.currentVrm.dispose === 'function') {
          this.currentVrm.dispose();
        }
        this.currentVrm = null;
      }
    },
    async reload() {
      this.loadError = null;
      this.clearModel();
      if (!this.src || !this.scene) return;
      try {
        const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
        const { VRMLoaderPlugin, VRMUtils } = await import('@pixiv/three-vrm');
        const loader = new GLTFLoader();
        loader.crossOrigin = 'anonymous';
        loader.register((parser) => new VRMLoaderPlugin(parser));
        const gltf = await loader.loadAsync(this.src);
        const vrm = gltf.userData.vrm;
        if (!vrm) {
          throw new Error('File did not contain a VRM model');
        }
        if (VRMUtils) {
          if (typeof VRMUtils.removeUnnecessaryVertices === 'function') {
            VRMUtils.removeUnnecessaryVertices(gltf.scene);
          }
          if (typeof VRMUtils.combineSkeletons === 'function') {
            VRMUtils.combineSkeletons(gltf.scene);
          }
          if (typeof VRMUtils.combineMorphs === 'function') {
            VRMUtils.combineMorphs(vrm);
          }
        }
        vrm.scene.traverse((obj) => {
          obj.frustumCulled = false;
        });
        this.scene.add(vrm.scene);
        this.currentVrm = vrm;
        if (this.controls) {
          this.controls.target.set(0, 1.0, 0);
          this.camera.position.set(0, 1.2, 2.2);
        }
      } catch (e) {
        this.loadError = e instanceof Error ? e.message : 'Failed to load VRM';
      }
    },
    dispose() {
      if (this.animId) cancelAnimationFrame(this.animId);
      this.clearModel();
      if (this.controls) this.controls.dispose();
      if (this.renderer) {
        this.renderer.dispose();
        if (this.renderer.domElement && this.renderer.domElement.parentNode) {
          this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
        }
      }
      this.scene = null;
      this.camera = null;
      this.renderer = null;
      this.controls = null;
    },
  },
};
</script>

<style>
.nx-vrm-preview {
  position: relative;
  width: 100%;
  border: 1px solid #d8dde3;
  border-radius: 8px;
  background: #f0f2f5;
  overflow: hidden;
}
.nx-vrm-preview canvas {
  display: block;
  width: 100% !important;
  height: 100% !important;
}
.nx-vrm-empty,
.nx-vrm-error {
  margin: 0;
  padding: 1rem;
  font-size: 0.8rem;
  color: #5b6570;
  text-align: center;
}
.nx-vrm-error {
  color: #b42318;
}
</style>
