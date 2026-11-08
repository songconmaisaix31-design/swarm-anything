import { useId } from 'react';

export function TextField({ label, value, onChange, multiline = false, required = false, disabled = false, hint, type = 'text', numberRange = { min: 0, max: 1, step: '0.01' } }: { label: string; value: string; onChange: (value: string) => void; multiline?: boolean; required?: boolean; disabled?: boolean; hint?: string; type?: 'text' | 'number' | 'url'; numberRange?: { min: number; max?: number; step?: string } }) {
  const id = useId();
  const props = { id, value, required, disabled, 'aria-label': label, 'aria-describedby': hint ? `${id}-hint` : undefined, onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => onChange(event.target.value) };
  return <label htmlFor={id}><span>{label}{required ? ' *' : ''}</span>{multiline ? <textarea {...props} /> : <input {...props} type={type} {...(type === 'number' ? numberRange : {})} />}{hint && <small id={`${id}-hint`}>{hint}</small>}</label>;
}

export function SelectField({ label, value, onChange, options, disabled = false }: { label: string; value: string; onChange: (value: string) => void; options: { value: string; label: string }[]; disabled?: boolean }) {
  const id = useId();
  return <label htmlFor={id}><span>{label}</span><select id={id} aria-label={label} value={value} disabled={disabled} onChange={event => onChange(event.target.value)}>{options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>;
}
