import type { MeterGroup } from '../api/meter-groups';
import type { Property } from '../api/properties';

// Module-level session cache — survives screen navigation, cleared on sign-out
let _meterGroups: MeterGroup[] | null = null;
let _properties: Property[] | null = null;

export const sessionCache = {
  getMeterGroups: () => _meterGroups,
  setMeterGroups: (d: MeterGroup[] | null) => {
    _meterGroups = d;
  },

  getProperties: () => _properties,
  setProperties: (d: Property[] | null) => {
    _properties = d;
  },

  clear: () => {
    _meterGroups = null;
    _properties = null;
  }
};
