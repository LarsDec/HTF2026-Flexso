using { oakhaven.curse as db } from '../db/schema';

/**
 * Water data of Oakhaven: pipes, their sensors and repairs, and the village landmarks.
 * Served at /odata/v4/water-supply — try http://localhost:4004/odata/v4/water-supply/WaterPipes
 */
// `impl` points CAP at the TypeScript handler file (written without the `.ts` extension).
service WaterSupplyService @(path: 'water-supply', impl: 'srv/water-supply-service') {

  @readonly
  entity WaterPipes as projection on db.WaterPipes {
    *,
    // 👋 EXAMPLE — a computed field. `virtual` = part of the API, but not a column in the database.
    //    CAP returns null for it until a handler fills it in: see addDaysSinceMaintenance in
    //    water-supply-service.ts. Shown as a column in src/oakhaven-app/webapp/view/Main.view.xml.
    virtual null as daysSinceMaintenance : Integer,
    // Status and repair priority, computed in srv/domain/* (see addHealthOverview in the .ts).
    virtual null as healthStatus      : String(10),   // fine | attention | alarm | unknown
    virtual null as statusReason      : String,
    virtual null as readingAgeMinutes : Integer,
    virtual null as healthState       : String(10),   // UI5 ValueState: Error | Warning | Success | None
    virtual null as healthIcon        : String,       // sap-icon:// name
    virtual null as priorityRank      : Integer,
    virtual null as priorityReason    : String,
    virtual null as inTodaysPlan      : Boolean,
    virtual null as sourceConflict    : Boolean,
    virtual null as lastRepairDate    : DateTime,
    virtual null as repaired          : Boolean,
    virtual null as suspiciousRepair  : Boolean
  };

  @readonly
  entity Sensors    as projection on db.Sensors;

  @readonly
  entity Repairs    as projection on db.Repairs;

  @readonly
  entity Landmarks  as projection on db.Landmarks;
}
