/* ───────────────────────────────────────────────────────────────
   Golfballs Extension — Design System component library.

   Trimmed manifest for the proof-submit-extension client build —
   re-exports ONLY the components reachable from ImagePreview +
   SubmitProof + their direct ui peers (ColorPicker, ToastHost,
   LiquidDrawer). Dropping the unused re-exports avoids dragging
   the template-editor / playground component tree into the
   client bundle and lets Rollup resolve the remaining modules
   without needing the page-engine / actionRegistry libs.
─────────────────────────────────────────────────────────────── */

export { Icon, I } from './icons.jsx';
export { T, TINT, SHAKE, SHAKE_T, Spinner, sizeIcon, useAsyncState, inputBaseStyle, ensureMarchingAntsStyle } from './shared.jsx';

export { Btn } from './components/Btn.jsx';
export { IconBtn } from './components/IconBtn.jsx';
export { Tag } from './components/Tag.jsx';
export { Dot } from './components/Dot.jsx';

export { Input } from './components/Input.jsx';
export { Textarea } from './components/Textarea.jsx';
export { Dropdown } from './components/Dropdown.jsx';
export { Field } from './components/Field.jsx';
export { Slider } from './components/Slider.jsx';
export { Segmented } from './components/Segmented.jsx';

export { Callout } from './components/Callout.jsx';
export { FloatingPanel } from './components/FloatingPanel.jsx';
export { DraggablePopup } from './components/DraggablePopup.jsx';
export { ModalHeader } from './components/ModalHeader.jsx';

export { ColorPicker, ColorPickerPopover } from './components/ColorPicker.jsx';
export { ToastHost, useToast } from './components/ToastHost.jsx';

export { ProofCard, ProofSphere, STATUS_TONE as PROOF_STATUS_TONE, statusTone as proofStatusTone } from './components/ProofCard.jsx';
