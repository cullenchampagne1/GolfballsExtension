# Notification Handoff

Five toast variants from the Action Card system, each as a standalone JSX
component matching your `src/ui/components/*.jsx` pattern. Every variant ships
with a `size` prop (`'md'` default · `'sm'` for narrow panels and sidebars).

## Files

| File                | Component     | Imports                       |
| ------------------- | ------------- | ----------------------------- |
| `PillToast.jsx`     | `PillToast`   | `Dot`, `I`                    |
| `ActionToast.jsx`   | `ActionToast` | `Btn`, `I`                    |
| `StepToast.jsx`     | `StepToast`   | `I`                           |
| `TrayToast.jsx`     | `TrayToast`   | `Dot`, `I`  +  `useState`     |
| `EdgeToast.jsx`     | `EdgeToast`   | `I`                           |
| `index.js`          | barrel        | —                             |

## Drop-in

1. Copy all five `.jsx` files into `src/ui/components/`.
2. Append to `src/ui/index.js`:
   ```js
   export { PillToast }   from './components/PillToast.jsx';
   export { ActionToast } from './components/ActionToast.jsx';
   export { StepToast }   from './components/StepToast.jsx';
   export { TrayToast }   from './components/TrayToast.jsx';
   export { EdgeToast }   from './components/EdgeToast.jsx';
   ```
3. Verify these `@keyframes` exist in your `theme.css` (they were in your
   Design System.html, but the production stylesheet may be missing them):
   - `gb-toast-in-top`
   - `gb-toast-in-right`
   - `gb-toast-in-left` *(unused by these five but kept for the family)*
   - `gb-spin`
   - `gb-pulse`

## Size choices

| Variant     | `md` (default)            | `sm` (narrow)            |
| ----------- | ------------------------- | ------------------------ |
| Pill        | font 12 · dot 7 · h ~32   | font 10.5 · dot 6 · h ~26 |
| Action      | 360 wide · icon 28        | 280 wide · icon 22       |
| Step        | 340 wide · step 16        | 280 wide · step 13       |
| Tray        | open 320 · badge 18       | open 260 · badge 15      |
| Edge        | ≤560 wide · pad 6/12      | ≤420 wide · pad 4/9      |

Pick `sm` when the host is < ~480px wide (extension panels, popups, sidebars).
Pick `md` everywhere else (full-page hosts, dashboards).

## Usage

```jsx
import { PillToast, ActionToast, StepToast, TrayToast, EdgeToast } from '../../ui';

<PillToast tone="success" message="Template saved" size="sm" />

<ActionToast
  tone="brand"
  title="Proof ready to send"
  message="Outlook draft created."
  primary="Send" secondary="Review"
  size="sm"
/>

<StepToast
  steps={['Render', 'Generate PDF', 'Upload', 'Notify']}
  currentStep={2}
  title="Submitting proof…"
/>

<TrayToast
  items={[
    { tone: 'brand',   title: 'Order failed',    message: 'Card declined',  time: '2m'  },
    { tone: 'warning', title: 'Proof feedback',  message: 'New comments',   time: '11m' },
  ]}
  size="sm"
/>

<EdgeToast tone="brand" message="Connected to Solr" />
```

## Toast manager (recommended)

These five variants are presentational only — they don't manage stacking,
auto-dismiss, or queueing. Wrap them in your existing toast manager (or a
new one) and pass `onDismiss` to remove the toast from the stack.

Quick contract:
```jsx
function ToastHost() {
  const [stack, setStack] = useState([]);
  const dismiss = (id) => setStack(s => s.filter(t => t.id !== id));
  return (
    <div style={{ position: 'fixed', top: 16, right: 16, display: 'flex', flexDirection: 'column', gap: 8, zIndex: 9999, pointerEvents: 'none' }}>
      {stack.map(({ id, kind, ...props }) => {
        const Comp = { pill: PillToast, action: ActionToast, step: StepToast, tray: TrayToast, edge: EdgeToast }[kind];
        return <Comp key={id} {...props} onDismiss={() => dismiss(id)} />;
      })}
    </div>
  );
}
```
