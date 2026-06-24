-- A "Ready" stage on the board: the order is finalized and can no longer be
-- worked on (it is hidden from Timekeeping's project picker), awaiting only
-- shipment. Pressing "Shipped" on the board clears this flag and sets
-- shipped = 1. Lets Glin park orders that are done but not yet sent.
ALTER TABLE projects ADD COLUMN ready INTEGER NOT NULL DEFAULT 0;
