export const STORE_TARGET_TOTAL = 400;

// Stores imported from the intake workbook arrive without a province, type or
// owner name. Aggregates and reports substitute this rather than emitting null,
// so a chart axis or a PDF field never renders an empty label.
export const STORE_UNSPECIFIED_LABEL = 'ไม่ระบุ';
