using { oakhaven.curse as db } from '../db/schema';

/**
 * Investigation of Oakhaven: suspicious lines and the marks "not to be trusted".
 * Served at /odata/v4/investigation — try http://localhost:4004/odata/v4/investigation/Findings
 */
service InvestigationService @(path: 'investigation', impl: 'srv/investigation-service') {

  /** The marks. Written only by the actions below. */
  @readonly
  entity Distrusts as projection on db.Distrusts;

  /**
   * Suspicious lines, computed on every read (nothing is stored): see srv/domain/investigation.ts.
   * Sorted by severity (most rules first), then newest change first. `key` is "<entityName>:<recordID>".
   */
  @readonly
  @cds.persistence.skip
  entity Findings {
    key ID          : String(80);
    entityName      : String(40);
    recordID        : UUID;
    label           : String;
    reason          : String;
    rules           : String;            // comma separated rule ids: impossibleFlow, negativeStock, nonPersonEditor, quietHours
    severity        : Integer;           // number of rules hit
    changedAt       : Timestamp;         // UTC
    changedBy       : String;
    status          : String(10);        // toReview (suspicious, not marked yet) | untrusted (marked)
    untrusted       : Boolean;
    distrustID      : UUID;
    untrustedReason : String(500);
    untrustedBy     : String(100);
    untrustedAt     : Timestamp;
  }

  /** One marked line for the council. */
  type CouncilLine {
    entityName : String(40);
    recordID   : UUID;
    label      : String;
    reason     : String(500);     // her reason, in plain words
    markedBy   : String(100);
    markedAt   : Timestamp;
    changedAt  : Timestamp;       // last change of the line itself (UTC)
    changedBy  : String;
  }

  type TimelineBucket {
    start : Timestamp;            // start of the hour or day (UTC)
    count : Integer;
  }

  /** Marked lines + timeline, see srv/domain/council-report.ts. pattern: none | single | atOnce | bitByBit. */
  type CouncilReport {
    total         : Integer;
    dated         : Integer;
    firstChangeAt : Timestamp;
    lastChangeAt  : Timestamp;
    spanMinutes   : Integer;
    pattern       : String(10);
    granularity   : String(4);    // hour | day
    buckets       : many TimelineBucket;
    lines         : many CouncilLine;
  }

  /** Every marked line with its reason, earliest change first, plus the timeline. Computed on every call. */
  function councilReport() returns CouncilReport;

  /** Marks one line as not to be trusted. Only a label: the line itself is not changed. */
  action markUntrusted(entityName : String, recordID : UUID, reason : String, markedBy : String) returns Distrusts;

  /** Removes the mark again. 404 when there is none. */
  action clearUntrusted(entityName : String, recordID : UUID) returns Boolean;
}
