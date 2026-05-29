/* ───────────────────────────────────────────────────────────────
   Golfballs Extension — Design System component library.

   Inline-styled + Motion-animated React primitives. Every color is
   a --gb-* token (see theme.css), so dropping the tree into any
   [data-theme] re-themes it with no component changes.

   Usage:  import { Btn, ModalShell, I } from '<path>/src/ui';
─────────────────────────────────────────────────────────────── */

export { Icon, I } from './icons.jsx';
export { T, TINT, SHAKE, SHAKE_T, Spinner, sizeIcon, useAsyncState, inputBaseStyle, ensureMarchingAntsStyle } from './shared.jsx';

export { Btn } from './components/Btn.jsx';
export { IconBtn } from './components/IconBtn.jsx';
export { Tag } from './components/Tag.jsx';
export { Chip } from './components/Chip.jsx';
export { Dot } from './components/Dot.jsx';
export { NumberDisplay } from './components/NumberDisplay.jsx';

export { Input } from './components/Input.jsx';
export { Textarea } from './components/Textarea.jsx';
export { RichTextEditor } from './components/RichTextEditor.jsx';
export { Dropdown } from './components/Dropdown.jsx';
export { TemplatePicker, parseTemplateValue } from './components/TemplatePicker.jsx';
export { ColorField } from './components/ColorField.jsx';
export { ColorButton } from './components/ColorButton.jsx';
export { ColorPicker, ColorPickerPopover } from './components/ColorPicker.jsx';
export { Field } from './components/Field.jsx';
export { Switch } from './components/Switch.jsx';
export { PillTag } from './components/PillTag.jsx';
export { Checkbox } from './components/Checkbox.jsx';
export { Slider } from './components/Slider.jsx';
export { RangeSlider } from './components/RangeSlider.jsx';
export { DatePicker, formatHumanDate, parseDateValue, serializeDateValue } from './components/DatePicker.jsx';
export { SwitchTag } from './components/SwitchTag.jsx';
export { Segmented } from './components/Segmented.jsx';
export { Tabs } from './components/Tabs.jsx';
export { StepsEditor } from './components/StepsEditor.jsx';
export { SettingNotificationHost, useSettingNotification } from './components/SettingNotification.jsx';
export { PillToast } from './components/PillToast.jsx';
export { ActionToast } from './components/ActionToast.jsx';
export { StepToast } from './components/StepToast.jsx';
export { TrayToast } from './components/TrayToast.jsx';
export { EdgeToast } from './components/EdgeToast.jsx';
export { ToastHost, useToast } from './components/ToastHost.jsx';

export { Callout } from './components/Callout.jsx';
export { ModalShell } from './components/ModalShell.jsx';
export { CompactModal } from './components/CompactModal.jsx';
export { FloatingPanel } from './components/FloatingPanel.jsx';
export { DraggablePopup } from './components/DraggablePopup.jsx';
export { Throwable } from './components/Throwable.jsx';
export { ModalHeader } from './components/ModalHeader.jsx';
export { ModalFooter } from './components/ModalFooter.jsx';
export { SectionLabel } from './components/SectionLabel.jsx';
export { Card } from './components/Card.jsx';
export { KeyVal } from './components/KeyVal.jsx';
export { EditorHeader } from './components/EditorHeader.jsx';
export { ResolveHint } from './components/ResolveHint.jsx';
export { CollapsibleChecklist } from './components/CollapsibleChecklist.jsx';
export { CollapsibleSection } from './components/CollapsibleSection.jsx';
export { TYPE_ICONS, TYPE_COLORS } from './typeIcons.jsx';
export { ProofCard, ProofSphere, STATUS_TONE as PROOF_STATUS_TONE, statusTone as proofStatusTone } from './components/ProofCard.jsx';
export { EmailHtmlView } from './components/EmailHtmlView.jsx';
export { CategorizeRail } from './components/CategorizeRail.jsx';

export { FeatureSpotlight } from './components/FeatureSpotlight.jsx';
export { ExpandableFeature } from './components/ExpandableFeature.jsx';
export { ColorSpotlight } from './components/ColorSpotlight.jsx';
export { ColorBank } from './components/ColorBank.jsx';

/* ── Template-editor components ─────────────────────────────── */
export { KindPill } from './components/KindPill.jsx';
export { BodyVar } from './components/BodyVar.jsx';
export { KindPickerGrid } from './components/KindPickerGrid.jsx';
export { MultiSelectCombo } from './components/MultiSelectCombo.jsx';
export { ConditionCard } from './components/ConditionCard.jsx';
export { VariableTable } from './components/VariableTable.jsx';
export { SmartModal } from './components/SmartModal.jsx';
export { SmartPopover } from './components/SmartPopover.jsx';
export { AddVariableModal, SOURCE_KINDS, BUILTIN_PATHS, REGEX_FIELDS } from './components/AddVariableModal.jsx';
export { InlineVariableForm } from './components/InlineVariableForm.jsx';
export { SignatureModal } from './components/SignatureModal.jsx';

/* ── Type-specific rule composites ──────────────────────────── */
export { OrderRules } from './components/template-rules/OrderRules.jsx';
export { CaseRules } from './components/template-rules/CaseRules.jsx';
export { AccountRules } from './components/template-rules/AccountRules.jsx';
export { AccountConditions } from './components/template-rules/AccountConditions.jsx';
export { CaseTagsEditor } from './components/template-rules/CaseTagsEditor.jsx';
