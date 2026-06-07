process.env.GOOGLE_APPLICATION_CREDENTIALS = "secrets/fake-creds.json";

const mockUpdate = jest.fn();
const mockCommit = jest.fn().mockResolvedValue(undefined);
const mockBatch = jest.fn(() => ({update: mockUpdate, commit: mockCommit}));
const mockGet = jest.fn();
const mockCollection = jest.fn(() => ({get: mockGet}));

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

describe("backfillPropertyMeterVersions", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();
    delete process.env.EXECUTE;
  });

  it("counts submeter entries needing backfill and writes nothing in dry-run mode", async () => {
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

    const {backfillPropertyMeterVersions} = require("./backfill-property-meter-versions");
    const result = await backfillPropertyMeterVersions();

    expect(result).toEqual({migrated: 1, skipped: 2});
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(mockCommit).not.toHaveBeenCalled();
  });

  it("stamps current_version and versions only on submeter entries lacking them when EXECUTE=true", async () => {
    process.env.EXECUTE = "true";
    mockGet.mockResolvedValue({
      docs: [
        docSnapshot("p1", {
          electricity: {meter_group_id: "mg1", is_main_meter: false},
          water: {meter_group_id: "mg2", is_main_meter: true},
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
    expect(updatePayload.meter_groups.water).toEqual({meter_group_id: "mg2", is_main_meter: true});
    expect(mockCommit).toHaveBeenCalledTimes(1);
  });

  it("skips properties that have no submeter entries needing migration", async () => {
    mockGet.mockResolvedValue({
      docs: [
        docSnapshot("p1", {
          water: {meter_group_id: "mg2", is_main_meter: true},
        }),
      ],
    });

    const {backfillPropertyMeterVersions} = require("./backfill-property-meter-versions");
    const result = await backfillPropertyMeterVersions();

    expect(result).toEqual({migrated: 0, skipped: 1});
    expect(mockUpdate).not.toHaveBeenCalled();
  });
});
