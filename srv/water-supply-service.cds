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
    virtual null as morningRank       : Integer,      // 1 or 2 for today's plan, otherwise null
    virtual null as sourceConflict    : Boolean,
    // When a sensor disagrees with its pipe: which sensor, and when/by whom its line was last changed.
    virtual null as conflictSensorID    : String,
    virtual null as conflictSensorFlow  : Decimal(15, 2),
    virtual null as conflictNominalFlow : Decimal(15, 2),
    virtual null as conflictChangedAt   : DateTime,
    virtual null as conflictChangedBy   : String,
    virtual null as lastRepairDate    : DateTime,
    virtual null as lastRepairIssue   : String,
    virtual null as lastRepairedBy    : String,
    virtual null as repaired          : Boolean,
    virtual null as suspiciousRepair  : Boolean,
    // "Not to be trusted" marks (see the investigation service and srv/lib/distrusts.ts).
    virtual null as untrusted         : Boolean,
    virtual null as untrustedReason   : String,
    virtual null as untrustedBy       : String,
    virtual null as untrustedAt       : Timestamp,
    // A mark on one of the pipe's sensors: "Sensor SENS-004 not to be trusted".
    virtual null as untrustedSensorIDs    : String,
    virtual null as untrustedSensorReason : String,
    virtual null as untrustedSensorBy     : String,
    virtual null as untrustedSensorAt     : Timestamp
  } actions {
    // Maren logs a finished repair by hand. Only this action writes to Repairs.
    action logRepair(issue : String, repairDate : Date, repairedBy : String) returns Repairs;
  };

  /**
   * "My morning": only the pipes of today's plan (at most 2), already in repair order.
   * The handler restricts the read to those pipes, so the app only binds to it.
   */
  @readonly
  entity MorningPlan as projection on WaterPipes;

  @readonly
  entity Sensors as projection on db.Sensors {
    *,
    virtual null as untrusted       : Boolean,
    virtual null as untrustedReason : String,
    virtual null as untrustedBy     : String,
    virtual null as untrustedAt     : Timestamp
  };

  @readonly
  entity Repairs as projection on db.Repairs {
    *,
    // Flags for the repair log (rules in srv/domain/repair-status.ts, see addRepairFlags in the .ts).
    virtual null as futureDated     : Boolean,
    virtual null as bySystem        : Boolean,
    virtual null as suspicious      : Boolean,
    virtual null as untrusted       : Boolean,
    virtual null as untrustedReason : String,
    virtual null as untrustedBy     : String,
    virtual null as untrustedAt     : Timestamp
  };

  @readonly
  entity Landmarks as projection on db.Landmarks {
    *,
    virtual null as untrusted       : Boolean,
    virtual null as untrustedReason : String,
    virtual null as untrustedBy     : String,
    virtual null as untrustedAt     : Timestamp
  };
}
