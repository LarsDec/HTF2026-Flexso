namespace oakhaven.curse;

using { cuid, managed } from '@sap/cds/common';

// Every entity below uses two standard CAP aspects:
//   cuid    → a UUID key field `ID`
//   managed → createdAt, createdBy, modifiedAt, modifiedBy (filled in by CAP on every write)

// ---------------------------------------------------------------------------
// Water — the pipe network that brings water from Silverbrook Spring to the village
// ---------------------------------------------------------------------------

/** Role of a pipe in the network. */
type PipelineType : String enum {
  mainLine;
  branch;
  secondary;
}

/** A water pipe in the Oakhaven supply network. */
entity WaterPipes : cuid, managed {
  /** Human-readable pipe name, e.g. "PRIMARY-MAIN". */
  pipeID          : String;
  /** Route label, e.g. "Silverbrook Spring → Central Market Square". */
  location        : String;
  /** Landmark names (`Landmarks.name`) the pipe runs between, in flow direction. */
  startPoint      : String;
  endPoint        : String;
  pipelineType    : PipelineType;
  diameter        : Decimal(9, 2); // mm
  length          : Decimal(9, 2); // m
  nominalFlowRate : Decimal(9, 2); // L/min — what the pipe carries at full capacity
  currentFlowRate : Decimal(9, 2); // L/min — what it carries right now
  currentPressure : Decimal(9, 2); // PSI   — water pressure right now
  lastMaintenance : DateTime;
  /** Route on the village map in grid units: "x,y x,y …", x/y in [0,8] from the
   *  south-west corner of cell A1 (centre of E6 = "4.5,5.5"), in flow direction. */
  mapPath         : String;
  sensors         : Composition of many Sensors on sensors.pipe = $self;
  repairs         : Composition of many Repairs on repairs.pipe = $self;
}

/** Flow/pressure sensor mounted on a water pipe. */
entity Sensors : cuid, managed {
  pipe        : Association to WaterPipes;
  sensorID    : String;
  flowRate    : Decimal(15, 2); // L/min measured by the sensor
  pressure    : Decimal(15, 2); // PSI measured by the sensor
  lastReading : DateTime;       // when the sensor last reported
}

/** Repair performed on a water pipe. */
entity Repairs : cuid, managed {
  pipe       : Association to WaterPipes;
  repairID   : UUID;
  issue      : String;
  repairDate : DateTime;
  repairedBy : String;
}

/** Kind of a village landmark. */
type LandmarkKind : String enum {
  spring;
  mill;
  market;
  inn;
  residential;
  bakery;
  farm;
  forest;
}

/** A landmark on the Oakhaven village map (chess-board cell A1…H8). */
entity Landmarks : cuid, managed {
  name       : String;
  kind       : LandmarkKind;
  /** Cell on the village map: column A–H (west → east) + row 1–8 (south → north). */
  gridCell   : String(2);
  /** pipeID of the branch that feeds this area (residential / bakery / farm only). */
  suppliedBy : String;
}

// ---------------------------------------------------------------------------
// Food — the village pantry
// ---------------------------------------------------------------------------

/** A food product of the village stock. */
entity StockItems : cuid, managed {
  itemID          : String;          // GRAIN, MILK, …
  name            : String;
  unit            : String;          // KG, L, Dozen, Number
  icon            : String;          // sap-icon://… (Tabler icons: sap-icon://ti/<name>)
  currentQuantity : Decimal(9, 2);   // in `unit`
  minStockLevel   : Decimal(9, 2);   // in `unit` — the level the village wants to stay above
  consumptionRate : Decimal(9, 2);   // `unit` per day the village uses up
  receivals       : Composition of many StockReceivals on receivals.item = $self;
  // --- Bakery reorder assistant (BakkerySpec.md) ---
  supplier            : Association to Suppliers;      // who delivers it (none for in-house items)
  isCritical          : Boolean default false;         // bread ingredient: flour, milk, butter
  marketDayMultiplier : Decimal(5, 2) default 1;       // use on market day = consumptionRate × this
  inHouse             : Boolean default false;         // made in the bakery (bread): never ordered
  orders              : Composition of many PurchaseOrders on orders.item = $self;
}

/** A delivery of a stock item. (No rows yet.) */
entity StockReceivals : cuid, managed {
  item             : Association to StockItems;
  quantityReceived : Decimal(9, 2); // in the item's `unit`
  supplier         : String;
  receivedAt       : DateTime;
}

/** A message about a stock item. (No rows yet.) */
entity Notifications : cuid, managed {
  item         : Association to StockItems;
  message      : String;
  acknowledged : Boolean default false;
}

// ---------------------------------------------------------------------------
// Bakery reorder assistant — suppliers, orders, settings and notification state
// ---------------------------------------------------------------------------

/** A supplier of the pantry. */
entity Suppliers : cuid, managed {
  name         : String;
  leadTimeDays : Integer; // whole days from order to pantry
  items        : Association to many StockItems on items.supplier = $self;
}

/** Life cycle of a purchase order. */
type PurchaseOrderStatus : String enum {
  open;     // ordered, counts as incoming stock
  received; // booked into StockItems.currentQuantity
}

/** An order Tobin marked as placed ("Mark as ordered"). */
entity PurchaseOrders : cuid, managed {
  item            : Association to StockItems;
  supplier        : Association to Suppliers;
  quantity        : Decimal(9, 2); // in the item's `unit`
  orderDate       : Date;
  expectedArrival : Date;          // orderDate + supplier lead time
  status          : PurchaseOrderStatus default 'open';
  receivedAt      : DateTime;
}

/** Settings of the reorder calculation and the notifications. One row. */
entity PantrySettings : cuid, managed {
  coverDays       : Integer default 7;                 // R5: ordinary days on top of the minimum
  horizonDays     : Integer default 60;                // R3: how far the order-by date is searched
  marketWeekday   : Integer default 6;                 // R1: 0 = Sunday … 6 = Saturday
  digestTime      : Time default '05:00:00';           // N2: local time of the daily digest
  quietHoursStart : Time default '20:00:00';           // N3: no immediate messages from …
  quietHoursEnd   : Time default '05:00:00';           //     … until
  timeZone        : String default 'Europe/Brussels';  // the pantry's clock
  recipientEmail  : String;                            // N7: who gets the email (empty = not set)
}

/** R4 status of a stock item. */
type ReorderStatus : String enum {
  OK;
  ORDER_TODAY;
  LATE;
}

/** N1: what Tobin was last told about an item. */
entity NotificationStates : cuid, managed {
  item            : Association to StockItems;
  status          : ReorderStatus;
  dataError       : Boolean default false;
  lastImmediateAt : DateTime; // N3: last immediate message
}

/** N2: date of the last digest run. One row. */
entity NotifierCheckpoints : cuid, managed {
  lastDigestDate : Date;
}

/** Email outbox: the messages the email channel produced (no mail server in this setup). */
entity OutboundMessages : cuid, managed {
  channel   : String;  // 'email'
  kind      : String;  // 'digest' | 'immediate'
  recipient : String;
  subject   : String;
  body      : LargeString;
}
// ---------------------------------------------------------------------------
// Investigation — lines Ilse marked as "not to be trusted"
// ---------------------------------------------------------------------------

/**
 * A mark on one line of another entity. The line itself stays untouched; only this label is added.
 * `entityName` is the entity (WaterPipes, Sensors, Repairs, Landmarks or StockItems), `recordID` its key.
 * Created by the action markUntrusted, deleted by clearUntrusted (no CSV: the table starts empty).
 */
entity Distrusts : cuid, managed {
  entityName : String(40);
  recordID   : UUID;
  reason     : String(500);
  markedBy   : String(100);   // typed in: the app is open, so `createdBy` is only "anonymous"
}
