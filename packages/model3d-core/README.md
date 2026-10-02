# @nexus/model3d-core

Framework-free kernel for ANX visual compositions.

Canonical space is right-handed, Z-up, millimetres (IFC / STEP / CAD). Legacy readers keep working because every save also writes Y-up scene-unit `position` and `rotation` mirrors.

The Three.js helper `buildModelGroup(THREE, model)` never imports `three`. Pass the namespace you already loaded. A single −90° rotation about X on the root converts Z-up into Three's Y-up.

`generator` scripts are data. Nothing in this package executes them. `checkGeneratorScript` is the static deny-list; the portal runs an accepted script in an opaque-origin iframe.
