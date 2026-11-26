// WebKit cannot style the filled part of a range track in CSS, so the track reads --fill (0 to 1) from this helper.
// Firefox uses ::-moz-range-progress and ignores it. Call after min and max are set. Programmatic `value` writes sync too.
export function bindRange(input) {
  const desc = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
  const sync = () => {
    const min = Number(input.min) || 0, max = input.max === '' ? 100 : Number(input.max);
    const f = max > min ? (Number(desc.get.call(input)) - min) / (max - min) : 0;
    input.style.setProperty('--fill', String(Math.min(1, Math.max(0, f))));
  };
  Object.defineProperty(input, 'value', { configurable: true, get() { return desc.get.call(this); }, set(v) { desc.set.call(this, v); sync(); } });
  input.addEventListener('input', sync);
  sync();
}
