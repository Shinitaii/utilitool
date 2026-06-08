process.env.GOOGLE_APPLICATION_CREDENTIALS = "secrets/fake-creds.json";

const mockUpdate = jest.fn();
const mockCommit = jest.fn().mockResolvedValue(undefined);
const mockBatch = jest.fn(() => ({update: mockUpdate, commit: mockCommit}));
const mockGet = jest.fn();
const mockMeterGroupDocGet = jest.fn();
const mockMeterGroupDoc = jest.fn(() => ({get: mockMeterGroupDocGet}));

const mockCollection = jest.fn((name: string) => {
  if (name === "meter_groups") {
    return {doc: mockMeterGroupDoc};
  }
  return {get: mockGet};
});

jest.mock("firebase-admin/app", () => ({
  initializeApp: jest.fn(),
  cert: jest.fn(),
}));

jest.mock("firebase-admin/firestore", () => ({
  getFirestore: jest.fn(() => ({
    collection: mockCollection,
    batch: mockBatch,
  })),
}));

function docSnapshot(id: string, meterGroups: Record<string, any> | undefined) {
  return {
    ref: {id},
    data: () => ({meter_groups: meterGroups}),
  };
}

function meterGroupDocSnapshot(exists: boolean, data?: Record<string, any>) {
  return {exists, data: () => data};
}

describe("backfillPropertyMeterVersions", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();
    delete process.env.EXECUTE;
    mockMeterGroupDocGet.mockResolvedValue(meterGroupDocSnapshot(false));
  });

  it("counts submeter AND main-meter entries needing backfill and writes nothing in dry-run mode", async () => {
    mockGet.mockResolvedValue({
      docs: [
        docSnapshot("p1", {
          electricity: {meter_group_id: "mg1", is_main_meter: false},
          water: {meter_group_id: "mg2", is_main_meter: true},
        }),
        docSnapshot("p2", {
          electricity: {meter_group_id: "mg1", is_main_meter: false, current_version: 1, versions: {}},
        }),
        docSnapshot("p3", undefined),
      ],
    });
    mockMeterGroupDocGet.mockResolvedValue(meterGroupDocSnapshot(true, {current_version: 2, versions: {"1": {reset_at: "ts", last_reading: 100}}}));

    const {backfillPropertyMeterVersions} = require("./backfill-property-meter-versions");
    const result = await backfillPropertyMeterVersions();

    expect(result).toEqual({migrated: 1, skipped: 2});
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(mockCommit).not.toHaveBeenCalled();
  });

  it("stamps fresh version tracking on submeter entries lacking it when EXECUTE=true", async () => {
    process.env.EXECUTE = "true";
    mockGet.mockResolvedValue({
      docs: [
        docSnapshot("p1", {
          electricity: {meter_group_id: "mg1", is_main_meter: false},
          water: {meter_group_id: "mg2", is_main_meter: true, current_version: 3, versions: {}},
        }),
      ],
    });

    const {backfillPropertyMeterVersions} = require("./backfill-property-meter-versions");
    const result = await backfillPropertyMeterVersions();

    expect(result).toEqual({migrated: 1, skipped: 0});
    expect(mockUpdate).toHaveBeenCalledTimes(1);
    const [, updatePayload] = mockUpdate.mock.calls[0];
    expect(updatePayload.meter_groups.electricity).toEqual({
      meter_group_id: "mg1",
      is_main_meter: false,
      current_version: 1,
      versions: {},
    });
    expect(updatePayload.meter_groups.water).toEqual({meter_group_id: "mg2", is_main_meter: true, current_version: 3, versions: {}});
    expect(mockCommit).toHaveBeenCalledTimes(1);
  });

  it("backfills main-meter entries by copying current_version/versions from their MeterGroup document when EXECUTE=true", async () => {
    process.env.EXECUTE = "true";
    mockGet.mockResolvedValue({
      docs: [
        docSnapshot("p1", {
          water: {meter_group_id: "mg2", is_main_meter: true},
        }),
      ],
    });
    mockMeterGroupDocGet.mockResolvedValue(
      meterGroupDocSnapshot(true, {current_version: 2, versions: {"1": {reset_at: "ts", last_reading: 634}}})
    );

    const {backfillPropertyMeterVersions} = require("./backfill-property-meter-versions");
    const result = await backfillPropertyMeterVersions();

    expect(result).toEqual({migrated: 1, skipped: 0});
    expect(mockUpdate).toHaveBeenCalledTimes(1);
    const [, updatePayload] = mockUpdate.mock.calls[0];
    expect(updatePayload.meter_groups.water).toEqual({
      meter_group_id: "mg2",
      is_main_meter: true,
      current_version: 2,
      versions: {"1": {reset_at: "ts", last_reading: 634}},
    });
  });

  it("falls back to current_version 1 and empty versions for main-meter entries whose MeterGroup is missing", async () => {
    process.env.EXECUTE = "true";
    mockGet.mockResolvedValue({
      docs: [
        docSnapshot("p1", {
          water: {meter_group_id: "missing-mg", is_main_meter: true},
        }),
      ],
    });
    mockMeterGroupDocGet.mockResolvedValue(meterGroupDocSnapshot(false));

    const {backfillPropertyMeterVersions} = require("./backfill-property-meter-versions");
    const result = await backfillPropertyMeterVersions();

    expect(result).toEqual({migrated: 1, skipped: 0});
    const [, updatePayload] = mockUpdate.mock.calls[0];
    expect(updatePayload.meter_groups.water).toEqual({
      meter_group_id: "missing-mg",
      is_main_meter: true,
      current_version: 1,
      versions: {},
    });
  });

  it("skips properties whose entries already have current_version set", async () => {
    mockGet.mockResolvedValue({
      docs: [
        docSnapshot("p1", {
          water: {meter_group_id: "mg2", is_main_meter: true, current_version: 1, versions: {}},
        }),
      ],
    });

    const {backfillPropertyMeterVersions} = require("./backfill-property-meter-versions");
    const result = await backfillPropertyMeterVersions();

    expect(result).toEqual({migrated: 0, skipped: 1});
    expect(mockUpdate).not.toHaveBeenCalled();
  });
});
