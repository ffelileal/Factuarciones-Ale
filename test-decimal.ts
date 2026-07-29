import { Decimal } from 'decimal.js';
const d = new Decimal(250000);
console.log("Decimal test value is:", d.toString(), "type:", typeof d, "constructor name:", d.constructor?.name);
