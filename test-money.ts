import { Money } from './src/domain/value-objects/Money';
const m = Money.create(250000.00);
console.log("Money created value:", m.toString());
