import { Decimal } from 'decimal.js';

const d = new Decimal(250000.12345678);
console.log("d.toDecimalPlaces(6) is:", d.toDecimalPlaces(6).toString());
console.log("d.toDecimalPlaces(6, Decimal.ROUND_HALF_UP) is:", d.toDecimalPlaces(6, Decimal.ROUND_HALF_UP).toString());
