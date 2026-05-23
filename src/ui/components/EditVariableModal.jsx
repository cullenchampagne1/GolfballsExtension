import React, { useState } from 'react';
import { Btn } from './Btn.jsx';
import { Input } from './Input.jsx';
import { Dropdown } from './Dropdown.jsx';
import { ModalShell } from './ModalShell.jsx';
import { ModalHeader } from './ModalHeader.jsx';
import { ModalFooter } from './ModalFooter.jsx';
import { SOURCE_KINDS } from './AddVariableModal.jsx';

/**
 * EditVariableModal — minimal modal to rename a variable or swap its kind
 * without losing smart options (fallback, transform, conditional, format).
 *
 * Props:
 *   typeId       'order'|'case'|'account'
 *   variable     The current variable {name, kind, config, smart, ...}
 *   allNames     Array of other variable names (for uniqueness check)
 *   onSave       ({name, kind}) => void
 *   onClose      () => void
 */
export function EditVariableModal({ typeId, variable, allNames = [], onSave, onClose }) {
  const [name, setName] = useState(variable.name || '');
  const [kind, setKind] = useState(variable.kind || 'literal');
  const [error, setError] = useState('');

  const kindOptions = (SOURCE_KINDS[typeId] || []).map((id) => ({
    id, label: id.charAt(0).toUpperCase() + id.slice(1),
  }));

  function handleSave() {
    // Validate name
    const trimmed = name.trim().replace(/\s/g, '_');
    if (!trimmed) {
      setError('Name cannot be empty');
      return;
    }
    if (trimmed !== variable.name && allNames.includes(trimmed)) {
      setError(`Variable "${trimmed}" already exists`);
      return;
    }
    onSave({ name: trimmed, kind });
    onClose();
  }

  return (
    <ModalShell onClose={onClose}>
      <ModalHeader onClose={onClose}>Edit variable</ModalHeader>
      <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div>
          <label style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--gb-text-muted)', display: 'block', marginBottom: 6 }}>
            Name
          </label>
          <Input
            value={name}
            mono
            autoFocus
            error={!!error}
            onChange={(v) => { setName(v); setError(''); }}
            placeholder="variable_name"
          />
        </div>
        <div>
          <label style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--gb-text-muted)', display: 'block', marginBottom: 6 }}>
            Source kind
          </label>
          <Dropdown
            size="sm"
            value={kind}
            options={kindOptions}
            onChange={setKind}
          />
        </div>
        {error && (
          <div style={{ padding: '8px 10px', background: 'var(--gb-error-tint-soft)', border: '1px solid var(--gb-error-tint-border)', borderRadius: 'var(--gb-r-sm)', fontSize: 11, color: 'var(--gb-error-fg)' }}>
            {error}
          </div>
        )}
      </div>
      <ModalFooter>
        <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
        <Btn variant="primary" onClick={handleSave}>Save changes</Btn>
      </ModalFooter>
    </ModalShell>
  );
}
