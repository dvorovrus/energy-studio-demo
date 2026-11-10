/* Pure mock energy balance. Positive battery current = charge. Positive grid = import. */
(function(root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.EnergyModel = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';
  const finite = (n, fallback) => Number.isFinite(Number(n)) ? Number(n) : fallback;
  const clamp = (n, min, max) => Math.min(max, Math.max(min, n));
  function calculate(input) {
    const soc = clamp(finite(input.soc, 0), 0, 100);
    const voltage = clamp(finite(input.voltage, 0), 0, 60);
    const current = clamp(finite(input.current, 0), -1000, 1000);
    const solarW = clamp(finite(input.solarW, 0), 0, 100000);
    const homeW = clamp(finite(input.homeW, 0), 0, 100000);
    const batteryW = voltage * current;
    const gridW = homeW + batteryW - solarW;
    const batteryMode = batteryW > 10 ? 'charge' : batteryW < -10 ? 'discharge' : 'idle';
    return {soc, voltage, current, solarW, homeW, batteryW, gridW, batteryMode, balanceError: solarW + gridW - homeW - batteryW};
  }
  function formatPower(value) {
    if (!Number.isFinite(value)) return '—';
    const abs = Math.abs(value);
    return abs >= 1000 ? (abs / 1000).toFixed(2).replace(/\.00$/, '') + ' кВт' : Math.round(abs) + ' Вт';
  }
  return {calculate, formatPower};
});
