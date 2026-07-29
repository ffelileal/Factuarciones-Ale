import { FormulaEvaluator } from '../Evaluator';
import { Decimal } from 'decimal.js';

function runTests() {
  console.log("=== Corriendo Pruebas Unitarias de FormulaEvaluator ===");

  const context = new Map<string, any>([
    ['BASIC', 200000],
    ['ANTIGUEDAD_ANOS', 8],
    ['ANTIGUEDAD_PORC', 1.5],
    ['SINDICATO', true],
    ['REMUNERATIVO_TOTAL', 224000],
    ['SMVM', 234315],
    ['GARANTIA_MINIMA', 210000]
  ]);

  const testCases = [
    {
      formula: "REMUNERATIVO_TOTAL * 0.11",
      expected: new Decimal(24640),
      description: "Descuento simple (Jubilación)"
    },
    {
      formula: "IF(SINDICATO, REMUNERATIVO_TOTAL * 0.025, 0)",
      expected: new Decimal(5600),
      description: "Condicional IF con Sindicato activo"
    },
    {
      formula: "IF(!SINDICATO, REMUNERATIVO_TOTAL * 0.025, 0)",
      expected: new Decimal(0),
      description: "Condicional IF con negación"
    },
    {
      formula: "MAX(BASIC, GARANTIA_MINIMA)",
      expected: new Decimal(210000),
      description: "Función MAX con dos variables"
    },
    {
      formula: "IF(ANTIGUEDAD_ANOS >= 5, BASIC * 0.02, BASIC * 0.01)",
      expected: new Decimal(4000),
      description: "Comparación e IF anidado"
    },
    {
      formula: "ROUND(REMUNERATIVO_TOTAL * 0.0333333, 2)",
      expected: new Decimal(7466.66),
      description: "Redondeo ROUND con precisión de decimales"
    },
    {
      formula: "SWITCH(ANTIGUEDAD_ANOS, 1, BASIC * 0.01, 5, BASIC * 0.05, 8, BASIC * 0.08, 0)",
      expected: new Decimal(16000),
      description: "Función SWITCH para selección de antigüedad"
    },
    {
      formula: "SUM(BASIC, 10000, 5000)",
      expected: new Decimal(215000),
      description: "Función SUM para acumulación de haberes"
    }
  ];

  let passed = 0;
  for (const tc of testCases) {
    try {
      const result = FormulaEvaluator.evaluate(tc.formula, context);
      if (result && typeof (result as any).equals === 'function') {
        const isSuccess = (result as Decimal).equals(tc.expected);
        if (isSuccess) {
          console.log(`[PASS] ${tc.description}`);
          passed++;
        } else {
          console.log(`[FAIL] ${tc.description} - Esperado: ${tc.expected.toString()}, Obtenido: ${result.toString()}`);
        }
      } else {
        console.log(`[FAIL] ${tc.description} - result no es Decimal. Obtenido tipo: ${typeof result}, constructor: ${result?.constructor?.name}, valor: ${result}`);
      }
    } catch (e: any) {
      console.log(`[ERROR] ${tc.description} - Lanzó excepción: ${e.message}`);
    }
  }

  console.log(`\nResultado: ${passed}/${testCases.length} pasados.`);
  if (passed !== testCases.length) {
    process.exit(1);
  }
}

runTests();
