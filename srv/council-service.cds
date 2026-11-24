/**
 * Council page of Oakhaven (Rowan): what hurts, biggest first. Everything is computed on read from
 * water, food and "not to be trusted" data, nothing is stored. Served at /odata/v4/council.
 */
service CouncilService @(path: 'council', impl: 'srv/council-service') {

  /** Ranked problems, worst first (water and food in one list). `rank` is the order to show. */
  @readonly @cds.persistence.skip
  entity Problems {
    key ID              : String(80);
        rank            : Integer;
        area            : String(5);        // water | food
        subject         : String;           // pipe ID or item name
        level           : String(20);       // waterAlarm | foodPanic | foodNervous | waterUnknown | waterAttention
        levelState      : String(10);       // UI5 ValueState
        levelIcon       : String;
        flowRate        : Decimal(9, 2);
        nominalFlowRate : Decimal(9, 2);
        flowPercent     : Integer;          // display only
        pressure        : Decimal(9, 2);
        readingAgeMinutes : Integer;
        quantity        : Decimal(9, 2);
        minimum         : Decimal(9, 2);
        unit            : String;
        peopleKind      : String(15);       // families | wholeVillage | unknown | nobody
        peopleCount     : Integer;
        places          : String;
        pipeNote        : String(30);       // bakeryBread | farmAnimalsHalfDay
        tiedTo          : String;
        tiedToUntrusted : String;
        tieVia          : String;
        trustNote       : String(20);       // sensorNotTrusted | sensorsDisagree
        trustNoteSubject : String;
        lastOnList      : Boolean;
  };

  /** Lines that are not to be trusted and are therefore not used in the ranking. */
  @readonly @cds.persistence.skip
  entity UntrustedLines {
    key ID            : String(120);
        lineKind      : String(10);         // stockItem | pipe | sensor | repair | landmark
        subject       : String;
        parentSubject : String;
        source        : String(20);         // mark | impossibleStock | sourceConflict
        recordedValue : Decimal(15, 2);
        recordedUnit  : String;
        comparedTo    : Decimal(15, 2);
        reason        : String(500);
        markedBy      : String(100);
        markedAt      : Timestamp;
        effect        : String(30);
  };

  /** One row (ID 'current'): counts for "How Oakhaven is doing". */
  @readonly @cds.persistence.skip
  entity Summary {
    key ID              : String(10);
        generatedAt     : Timestamp;
        pipesTotal      : Integer;
        pipesAlarm      : Integer;
        pipesUnknown    : Integer;
        pipesAttention  : Integer;
        pipesFine       : Integer;
        pipesNotCounted : Integer;
        waterFineNames  : String;
        itemsTotal      : Integer;
        itemsPanic      : Integer;
        itemsNervous    : Integer;
        itemsFine       : Integer;
        itemsNotCounted : Integer;
        foodFineNames   : String;
        untrustedCount  : Integer;
  };
}
