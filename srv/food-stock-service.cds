using { oakhaven.curse as db } from '../db/schema';

/**
 * Food data of Oakhaven: the village pantry.
 * Served at /odata/v4/food-stock — try http://localhost:4004/odata/v4/food-stock/StockItems
 */
// `impl` points CAP at the TypeScript handler file (written without the `.ts` extension).
service FoodStockService @(path: 'food-stock', impl: 'srv/food-stock-service') {

  // StockItems is the entity associations point to (ReorderLines/OrderProposals are views on it too).
  @readonly
  @cds.redirection.target
  entity StockItems     as projection on db.StockItems {
    *,
    // "Not to be trusted" marks (investigation service, srv/lib/distrusts.ts).
    virtual null as untrusted       : Boolean,
    virtual null as untrustedReason : String,
    virtual null as untrustedBy     : String,
    virtual null as untrustedAt     : Timestamp
  } actions {
    /** Maintains the reorder attributes of an item (spec Must 4). */
    action setReorderAttributes(supplier_ID : UUID, isCritical : Boolean, marketDayMultiplier : Decimal(5, 2), inHouse : Boolean) returns StockItems;
  };

  @readonly
  entity StockReceivals as projection on db.StockReceivals;

  @readonly
  entity Notifications  as projection on db.Notifications actions {
    /** Marks an in-app message as read. */
    action acknowledge() returns Notifications;
  };

  // ------------------------------------------------------------------------------------------
  // Bakery reorder assistant (BakkerySpec.md)
  // ------------------------------------------------------------------------------------------

  @readonly
  entity Suppliers      as projection on db.Suppliers actions {
    /** Renames a supplier and/or changes its lead time. */
    action updateSupplier(name : String, leadTimeDays : Integer) returns Suppliers;
  };

  @readonly
  entity PurchaseOrders as projection on db.PurchaseOrders {
    *,
    item.name     as itemName     : String,
    item.unit     as unit         : String,
    supplier.name as supplierName : String
  } actions {
    /** The delivery arrived: books the quantity into stock and records a StockReceivals row. */
    action markAsReceived() returns PurchaseOrders;
  };

  @readonly
  entity PantrySettings as projection on db.PantrySettings actions {
    action updateSettings(coverDays : Integer, horizonDays : Integer, marketWeekday : Integer,
                          digestTime : Time, quietHoursStart : Time, quietHoursEnd : Time,
                          timeZone : String, recipientEmail : String) returns PantrySettings;
  };

  @readonly
  entity NotificationStates as projection on db.NotificationStates;

  @readonly
  entity OutboundMessages   as projection on db.OutboundMessages;

  /**
   * One row per stock item with the computed reorder figures (R1–R6) for "today".
   * Everything `virtual` is filled in by the READ handler in food-stock-service.ts.
   * "Today" is the pantry's date, or the custom query option `?today=YYYY-MM-DD`.
   */
  @readonly
  entity ReorderLines   as projection on db.StockItems {
    key ID,
        itemID,
        name,
        unit,
        icon,
        currentQuantity,
        minStockLevel,
        consumptionRate,
        isCritical,
        inHouse,
        marketDayMultiplier,
        supplier.ID           as supplierID   : UUID,
        supplier.name         as supplierName : String,
        supplier.leadTimeDays as leadTimeDays : Integer,
        virtual null as today                : Date,
        virtual null as forecastStock        : Decimal(9, 2), // stock at the start of `today` (forecast when today is after the real today)
        virtual null as isForecast           : Boolean,
        virtual null as status               : String,  // OK | ORDER_TODAY | LATE
        virtual null as arrivalStock         : Decimal(9, 2),
        virtual null as orderByDate          : Date,
        virtual null as noOrderWithinHorizon : Boolean,
        virtual null as horizonDays          : Integer, // R3 search window used
        virtual null as orderQuantity        : Decimal(9, 2),
        virtual null as belowMinimumNow      : Boolean,
        virtual null as stockOutRisk         : Boolean,
        virtual null as dataError            : Boolean,
        virtual null as openOrderQuantity    : Decimal(9, 2),
        virtual null as nextArrival          : Date,
        virtual null as sortRank             : Integer  // default order: critical first, then worst status
  } actions {
    /** "Mark as ordered" (spec Should 8): stores an open order, counted as incoming stock in R2. */
    action markAsOrdered(quantity : Decimal(9, 2), orderDate : Date) returns PurchaseOrders;
  };

  /** The lines of ReorderLines with something to order, grouped per supplier (spec Should 6). */
  @readonly
  entity OrderProposals as projection on ReorderLines;

  /** One day of the stock projection (spec Should 7). */
  type ProjectionDay {
    date          : Date;
    dayNumber     : Integer;
    isMarketDay   : Boolean;
    use           : Decimal(9, 2);
    incoming      : Decimal(9, 2);
    expectedStock : Decimal(9, 2);
    minStockLevel : Decimal(9, 2);
    unit          : String;
    belowMinimum  : Boolean;
  }

  /** Day-by-day expected stock of one item, today + `days` days (default 14), no new order placed. */
  function stockProjection(item : UUID, today : Date, days : Integer) returns many ProjectionDay;

  /** Adds a new supplier (name must be unique, lead time 0-60 days). */
  action createSupplier(name : String, leadTimeDays : Integer) returns Suppliers;

  /** Adds a new stock item to the pantry. In-house items get no supplier; all others need one. */
  action createStockItem(itemID : String, name : String, unit : String, icon : String,
                         currentQuantity : Decimal(9, 2), minStockLevel : Decimal(9, 2), consumptionRate : Decimal(9, 2),
                         supplier_ID : UUID, isCritical : Boolean, marketDayMultiplier : Decimal(5, 2),
                         inHouse : Boolean) returns StockItems;

  /** Runs the notification check now (normally every minute in the background). Returns a summary. */
  action runNotifier() returns String;
}
