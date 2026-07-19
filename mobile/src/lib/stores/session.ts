import { listMeterGroups, type MeterGroup } from '../api/meter-groups';
import { listProperties, type Property } from '../api/properties';

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

  // Returns the cached list, fetching and caching it on first call.
  async getOrFetchMeterGroups(): Promise<MeterGroup[]> {
    if (!_meterGroups) {
      const res = await listMeterGroups();
      _meterGroups = res.data || [];
    }
    return _meterGroups!;
  },

  async getOrFetchProperties(): Promise<Property[]> {
    if (!_properties) {
      const res = await listProperties();
      _properties = res.data || [];
    }
    return _properties!;
  },

  clear: () => {
    _meterGroups = null;
    _properties = null;
  }
};
