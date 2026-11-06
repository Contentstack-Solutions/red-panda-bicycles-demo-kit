// Custom profile fields and stream mappings for the seed. Created and
// published before any data is sent: unmapped keys never reach profiles, and
// mappings don't reprocess events already received.
const field = (id, type, mergeop, shortdesc) => ({ id, type, mergeop, shortdesc, is_identifier: false });

export const FIELDS = [
  field("loyalty_id", "string", "latest", "Red Panda loyalty ID"),
  field("club_membership", "string", "latest", "Cycling club membership"),
  field("home_area", "string", "latest", "Home neighbourhood or town"),
  field("home_distance_km", "number", "latest", "Home distance to Amsterdam Centraal (km)"),
  field("products_owned", "[]string", "merge", "Bikes owned"),
  field("product_purchase_ts", "map[string]time", "mapmin", "First purchase time by product"),
  field("accessories_owned", "[]string", "merge", "Accessories owned"),
  field("volt_review_rating", "int", "latest", "RP Volt review rating"),
  field("volt_review_text", "string", "latest", "RP Volt review text"),
  field("battery_service_tickets", "int", "latest", "Battery service tickets"),
  field("last_test_ride", "string", "latest", "Last test ride"),
  field("roam_preorder_ts", "date", "latest", "RP Roam pre-order time"),
  field("trade_in", "string", "latest", "Trade-in bike"),
  field("seed_batch", "string", "latest", "Synthetic seed batch"),
  // Site analytics (browser events, see src/lib/analytics.js and tripTracking.js)
  field("last_bike_clicked", "string", "latest", "Last recommended bike clicked in the Trip Planner"),
  field("bike_recommendation_clicks", "int", "sum", "Recommended bike clicks in the Trip Planner"),
  field("cart_products", "[]string", "merge", "Products added to the cart"),
  field("last_cart_add_ts", "date", "latest", "Last add to cart"),
  field("checkout_started_ts", "date", "latest", "Last checkout started"),
];

// Fields that already exist in the account that the seed also maps into.
export const EXISTING_FIELDS = ["email", "_uids", "first_name", "last_name", "city", "country"];

const map = (stream, fieldId, expr, guard_expr) => ({ stream, field: fieldId, expr, ...(guard_expr ? { guard_expr } : {}) });

const PURCHASE = 'eq(`action`, "purchase")';

export const MAPPINGS = [
  // rp_crm — one record per person
  map("rp_crm", "email", "email(`email`)"),
  map("rp_crm", "_uids", "set(`_uid`)"),
  map("rp_crm", "first_name", "`first_name`"),
  map("rp_crm", "last_name", "`last_name`"),
  map("rp_crm", "city", "`city`"),
  map("rp_crm", "country", "countrycode(`country`)"),
  map("rp_crm", "home_area", "`home_area`"),
  map("rp_crm", "home_distance_km", "tonumber(`home_distance_km`)"),
  map("rp_crm", "loyalty_id", "`loyalty_id`"),
  map("rp_crm", "club_membership", "`club_membership`"),
  map("rp_crm", "volt_review_rating", "toint(`volt_review_rating`)"),
  map("rp_crm", "volt_review_text", "`volt_review_text`"),
  map("rp_crm", "battery_service_tickets", "toint(`battery_service_tickets`)"),
  map("rp_crm", "last_test_ride", "`last_test_ride`"),
  map("rp_crm", "seed_batch", "`seed_batch`"),
  // rp_orders — one record per purchased item or pre-order
  map("rp_orders", "email", "email(`email`)"),
  map("rp_orders", "_uids", "set(`_uid`)"),
  map("rp_orders", "products_owned", "set(`product`)", `and(${PURCHASE}, ne(\`product_kind\`, "accessory"))`),
  map("rp_orders", "accessories_owned", "set(`product`)", `and(${PURCHASE}, eq(\`product_kind\`, "accessory"))`),
  map("rp_orders", "product_purchase_ts", "map(`product`, epochms())", PURCHASE),
  map("rp_orders", "roam_preorder_ts", "todate(epochms())", 'eq(`action`, "preorder")'),
  map("rp_orders", "trade_in", "`trade_in`"),
  // trip_planner: the existing trip mappings have no event guard, so these do.
  map("trip_planner", "last_bike_clicked", "`bike_clicked`", 'eq(`event`, "bike_recommendation_clicked")'),
  map("trip_planner", "bike_recommendation_clicks", 'toint("1")', 'eq(`event`, "bike_recommendation_clicked")'),
  // rp_cart — browser cart events, identified like trip_planner
  map("rp_cart", "_uids", "set(`_uid`, `_uido`)"),
  map("rp_cart", "cart_products", "set(`product`)", 'eq(`event`, "add_to_cart")'),
  map("rp_cart", "last_cart_add_ts", "todate(epochms())", 'eq(`event`, "add_to_cart")'),
  map("rp_cart", "checkout_started_ts", "todate(epochms())", 'eq(`event`, "checkout_started")'),
];
