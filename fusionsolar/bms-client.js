/* Pure JK-BMS telemetry normalization. Never guesses unmeasured PV/grid/home. */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.JKBms = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const finite = value => typeof value === 'number' && Number.isFinite(value);
  const inRange = (n, min, max) => finite(n) && n >= min && n <= max;
  const optional = (v, min, max) => inRange(v,min,max) ? v : null;
  function normalize(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Invalid telemetry object');
    if (typeof raw.valid !== 'boolean' || typeof raw.ble !== 'boolean') throw new Error('Missing BLE status');
    const age = raw.age_ms;
    const fresh = raw.valid && raw.ble && inRange(age, 0, 12000 - Number.EPSILON);
    // Reject invalid numeric data, including values returned before the first valid BLE sample.
    const fieldsValid = inRange(raw.pack, 15, 40) && inRange(raw.soc, 0, 100) &&
      inRange(raw.current, -500, 500) &&
      Array.isArray(raw.cells) && raw.cells.length === 8 && raw.cells.every(v=>inRange(v, 2, 4.25));
    if (fresh && !fieldsValid) throw new Error('Invalid battery telemetry');
    if (!fresh) return {fresh:false, ageMs:finite(age)?age:null, connected:raw.ble, valid:raw.valid};
    const lowest = Math.min(...raw.cells), highest = Math.max(...raw.cells);
    const pack = raw.pack, current = raw.current, soc=raw.soc;
    return {
      fresh:true, connected:true, valid:true, ageMs:age,
      soc, pack, current, powerW:pack*current, cells:raw.cells.slice(),
      minCell:lowest, maxCell:highest, cellDeltaMv:Math.round((highest-lowest)*1000),
      temperature1:optional(raw.t1,-40,120),temperature2:optional(raw.t2,-40,120),
      mosTemp:optional(raw.mos,-40,120), balanceA:optional(raw.balance,-50,50),
      balancerAction:optional(raw.balancer_action,0,10),
      soh:raw.capacity_valid?optional(raw.soh,0,100):null,
      remainingAh:raw.capacity_valid?optional(raw.capacity_remaining_ah,0,2000):null,
      nominalAh:raw.capacity_valid?optional(raw.capacity_nominal_ah,0,2000):null,
      cycleCount:raw.capacity_valid?optional(raw.cycle_count,0,1000000):null,
      sampleCount:optional(raw.sample_count,0,0xFFFFFFFF),
      chargeMos:Boolean(raw.charge_mos),dischargeMos:Boolean(raw.discharge_mos),
      errors:typeof raw.errors==='string'?raw.errors:null,
      cellResistances:Array.isArray(raw.cell_resistance_mohm) &&
        raw.cell_resistance_mohm.length===8 ? raw.cell_resistance_mohm.map(v=>optional(v,0,5000)):null
    };
  }
  function demoCells(soc) {
    const middle=3.05 + Math.max(0,Math.min(100,soc))*.00345;
    return [-.005,-.002,0,.003,-.003,.002,.005,0].map(offset=>Math.round((middle+offset)*1000)/1000);
  }
  return {normalize, demoCells};
});
